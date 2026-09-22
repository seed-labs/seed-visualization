#!/usr/bin/env python3
"""Generate a host-heavy geographic Internet for the Morris worm lab."""

from __future__ import annotations

import argparse
from collections import Counter
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
import random
import shutil
import stat
import sys


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = next(
    (parent for parent in SCRIPT_DIR.parents
     if (parent / "seedemu" / "__init__.py").is_file()),
    SCRIPT_DIR,
)

sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(SCRIPT_DIR))

from geopy.distance import geodesic

from seedemu.compiler import Docker, DockerImage, Platform
from seedemu.core import Binding, Emulator, Filter
from seedemu.layers import (
    Base,
    Ebgp,
    Ibgp,
    Ospf,
    PeerRelationship,
    Routing,
)
from seedemu.services import (
    DomainNameCachingService,
    DomainNameService,
)

from cityies import IX_LOCATIONS


META = "org.seedsecuritylabs.seedemu.meta."

IX_IDS = tuple(range(100, 120))

STUB_ASNS = {
    ix: 150 + ix - 100
    for ix in IX_IDS
}

IX_COUNT = len(IX_IDS)
TRANSIT_AS_COUNT = IX_COUNT - 1
TRANSIT_ROUTER_COUNT = TRANSIT_AS_COUNT * 2
STUB_ROUTER_COUNT = len(STUB_ASNS)

# 20 IX route servers + 38 transit routers + 20 stub routers.
FIXED_NODE_COUNT = (
    IX_COUNT
    + TRANSIT_ROUTER_COUNT
    + STUB_ROUTER_COUNT
)

MIN_HOSTS_PER_STUB = 2

# Stub LAN:
# .1       = Docker gateway
# .2       = stub router
# .53      = DNS, where applicable
# .71..254 = ordinary host allocation
HOST_OCTETS = tuple(range(71, 255))
MAX_HOSTS_PER_STUB = len(HOST_OCTETS)

MIN_NODE_COUNT = (
    FIXED_NODE_COUNT
    + len(STUB_ASNS) * MIN_HOSTS_PER_STUB
)
MAX_NODE_COUNT = (
    FIXED_NODE_COUNT
    + len(STUB_ASNS) * MAX_HOSTS_PER_STUB
)

# Host positions must remain within this radius range.
HOST_MIN_RADIUS_KM = 200.0
HOST_MAX_RADIUS_KM = 2000.0
HOST_GEO_ATTEMPTS = 20000

REAL_WORLD_ASN = 77777
REAL_WORLD_IX = 102
REAL_WORLD_ADDRESS = "10.102.0.177"

AUTHORITATIVE_DNS = (
    ("root-server", 150, "host_0", "Root"),
    ("com-server", 160, "host_0", "COM"),
)

RECURSIVE_DNS = (
    ("dns-resolver-1", 163, "host_0"),
    ("dns-resolver-2", 169, "host_0"),
)

DNS_HOSTS = {
    (asn, hostname)
    for _, asn, hostname, _ in AUTHORITATIVE_DNS
} | {
    (asn, hostname)
    for _, asn, hostname in RECURSIVE_DNS
}

# south, north, west, east
DESERT_CORES = [
    (19, 29, -12, 32),
    (19, 24, 44, 55),
    (37, 41, 77, 89),
    (42, 46, 95, 110),
    (39, 44, 54, 64),
    (-26, -19, 13, 16),
    (-27, -20, 19, 24),
    (-26, -20, -70, -67),
    (-30, -20, 120, 140),
]


def distance(a, b):
    """Approximate great-circle distance in kilometers."""
    lat1, lon1, lat2, lon2 = map(
        radians,
        (a[3], a[4], b[3], b[4]),
    )

    h = (
        sin((lat2 - lat1) / 2) ** 2
        + cos(lat1)
        * cos(lat2)
        * sin((lon2 - lon1) / 2) ** 2
    )

    return 12742 * asin(
        sqrt(min(1.0, max(0.0, h)))
    )


def valid_land(lat, lon):
    from global_land_mask import globe

    return (
        -60 < lat < 66
        and -180 <= lon <= 180
        and not any(
            south <= lat <= north
            and west <= lon <= east
            for south, north, west, east in DESERT_CORES
        )
        and bool(globe.is_land(lat, lon))
    )


def load_cities():
    try:
        from global_land_mask import globe
    except ImportError as exc:
        raise RuntimeError(
            "Install the example requirements first, including "
            "global-land-mask and geopy."
        ) from exc

    unique = {}

    for city in IX_LOCATIONS:
        lat, lon = city[3:5]

        if not valid_land(lat, lon):
            continue

        unique.setdefault(
            (round(lat, 6), round(lon, 6)),
            city,
        )

    return list(unique.values())


def select_anchors(cities):
    """Select 20 geographically distributed IX anchor cities."""
    quotas = {
        "North America": 3,
        "South America": 3,
        "Europe": 4,
        "Africa": 3,
        "Asia": 4,
        "Oceania": 3,
    }

    anchors = {}

    for region, count in quotas.items():
        pool = [
            city
            for city in cities
            if city[0] == region
        ]

        if len(pool) < count:
            raise ValueError(
                f"Not enough validated cities in {region}: "
                f"need {count}, found {len(pool)}"
            )

        chosen = [pool[0]]

        while len(chosen) < count:
            selected = max(
                (
                    city
                    for city in pool
                    if city not in chosen
                ),
                key=lambda city: min(
                    distance(city, previous)
                    for previous in chosen
                ),
            )
            chosen.append(selected)

        for city in chosen:
            anchors[100 + len(anchors)] = city

    return anchors


def backbone(anchors):
    """Connect all IXes with 19 edges, preferring regional links."""
    reached = {min(anchors)}
    edges = []

    while len(reached) < len(anchors):
        a, b = min(
            (
                (a, b)
                for a in sorted(reached)
                for b in sorted(anchors)
                if b not in reached
            ),
            key=lambda pair: (
                anchors[pair[0]][0]
                != anchors[pair[1]][0],
                distance(
                    anchors[pair[0]],
                    anchors[pair[1]],
                ),
                pair,
            ),
        )

        edges.append((a, b))
        reached.add(b)

    return edges


def set_geo(
    node,
    city,
    role,
    source="cityies-land-mask-validated",
):
    region, country, name, lat, lon, _ = city

    node.setGeo(lat, lon, name)

    labels = {
        "geo.lat": f"{lat:.6f}",
        "geo.lon": f"{lon:.6f}",
        "geo.city": name,
        "geo.country": country,
        "geo.region": region,
        "geo.source": source,
        "topology.role": role,
    }

    for key, value in labels.items():
        node.setLabel(key, value)


class GeoAllocator:
    """Allocate distinct land coordinates around topology anchors."""

    def __init__(self, cities, seed):
        self.rng = random.Random(seed)

        self.occupied = {
            (
                round(city[3], 6),
                round(city[4], 6),
            )
            for city in cities
        }

    def near(
        self,
        anchor,
        min_km,
        max_km,
        label,
        *,
        allow_shrink=True,
        attempts_per_scale=600,
    ):
        if not 0 <= min_km < max_km:
            raise ValueError(
                f"Invalid radius range: {min_km}..{max_km}"
            )

        scales = (
            (1.0, 0.5, 0.2, 0.05)
            if allow_shrink
            else (1.0,)
        )

        for scale in scales:
            lower = max(0.02, min_km * scale)
            upper = max(
                lower + 0.02,
                max_km * scale,
            )

            for _ in range(attempts_per_scale):
                # Uniform sampling by area within the annulus.
                radius = sqrt(
                    self.rng.uniform(
                        lower * lower,
                        upper * upper,
                    )
                )
                bearing = self.rng.uniform(0, 360)

                point = geodesic(
                    kilometers=radius
                ).destination(
                    anchor[3:5],
                    bearing,
                )

                coord = (
                    round(point.latitude, 6),
                    round(point.longitude, 6),
                )

                if coord in self.occupied:
                    continue

                if not valid_land(*coord):
                    continue

                # Verify the rounded coordinate remains in range.
                actual_distance = geodesic(
                    anchor[3:5],
                    coord,
                ).km

                if not lower <= actual_distance <= upper:
                    continue

                self.occupied.add(coord)

                # Region/country describe the associated anchor.
                # Offset coordinates are not reverse-geocoded.
                return (
                    anchor[0],
                    anchor[1],
                    f"{anchor[2]} / {label}",
                    coord[0],
                    coord[1],
                    anchor[5],
                )

        raise ValueError(
            f"Cannot allocate a distinct land position for {label} "
            f"near {anchor[2]} within {min_km}..{max_km} km. "
            f"allow_shrink={allow_shrink}"
        )


def distribute_hosts(node_count):
    """Allocate all nodes beyond the fixed routing core to hosts."""
    if not MIN_NODE_COUNT <= node_count <= MAX_NODE_COUNT:
        raise ValueError(
            f"--nodes must be between {MIN_NODE_COUNT} "
            f"and {MAX_NODE_COUNT}."
        )

    total_hosts = node_count - FIXED_NODE_COUNT

    base_count, remainder = divmod(
        total_hosts,
        len(STUB_ASNS),
    )

    counts = {}

    for index, ix in enumerate(sorted(STUB_ASNS)):
        count = base_count + (
            1 if index < remainder else 0
        )

        if not MIN_HOSTS_PER_STUB <= count <= MAX_HOSTS_PER_STUB:
            raise ValueError(
                f"AS{STUB_ASNS[ix]} would contain {count} hosts, "
                f"outside the supported range "
                f"{MIN_HOSTS_PER_STUB}..{MAX_HOSTS_PER_STUB}."
            )

        counts[ix] = count

    return counts


def transit_peerings(records):
    """Build a provider/customer tree over shared IX networks."""
    root = records[0]["asn"]

    owners = {
        ix: root
        for ix in records[0]["ixes"]
    }

    depths = {root: 0}
    peerings = []

    for record in records[1:]:
        candidates = [
            (
                depths[owners[ix]],
                ix,
                owners[ix],
            )
            for ix in sorted(set(record["ixes"]))
            if ix in owners
        ]

        if not candidates:
            raise ValueError(
                f"AS{record['asn']} has no shared IX "
                "with the established backbone."
            )

        depth, ix, provider = min(candidates)
        customer = record["asn"]

        peerings.append(
            (ix, provider, customer)
        )

        depths[customer] = depth + 1

        for ix in record["ixes"]:
            owners.setdefault(ix, customer)

    return peerings


def setup_dns(emu):
    """Configure root and COM authoritative servers."""
    base = emu.getLayer("Base")

    dns = DomainNameService()
    emu.addLayer(dns)

    dns.install("root-server").addZone(".").setMaster()
    dns.install("com-server").addZone("com.").setMaster()

    dns.getZone("com.").addRecord(
        "worm.com. 1 IN A 2.0.0.0"
    )

    for virtual_name, asn, hostname, display_name in AUTHORITATIVE_DNS:
        host = base.getAutonomousSystem(asn).getHost(
            hostname
        )

        # host_0 was initially assigned .71; move DNS to .53.
        host.updateNetwork(
            "net0",
            f"10.{asn}.0.53",
        )

        emu.addBinding(
            Binding(
                virtual_name,
                filter=Filter(
                    asn=asn,
                    nodeName=hostname,
                ),
            )
        )

        emu.getVirtualNode(
            virtual_name
        ).setDisplayName(display_name)


def setup_ldns(emu):
    """Configure recursive resolvers and node resolver settings."""
    base = emu.getLayer("Base")

    ldns = DomainNameCachingService(autoRoot=True)
    emu.addLayer(ldns)

    resolvers = []

    for virtual_name, asn, hostname in RECURSIVE_DNS:
        host = base.getAutonomousSystem(asn).getHost(
            hostname
        )

        host.updateNetwork(
            "net0",
            f"10.{asn}.0.53",
        )

        resolver = ldns.install(virtual_name)

        emu.addBinding(
            Binding(
                virtual_name,
                filter=Filter(
                    asn=asn,
                    nodeName=hostname,
                ),
            )
        )

        emu.getVirtualNode(
            virtual_name
        ).setDisplayName(
            f"DNS Resolver AS{asn}"
        )

        resolvers.append(resolver)

    stub_ases = sorted(STUB_ASNS.values())
    midpoint = len(stub_ases) // 2

    resolvers[0].setNameServerOnNodesByAsns(
        asns=stub_ases[:midpoint]
    )
    resolvers[1].setNameServerOnAllNodes()


def setup_real_world_exit(
    base,
    ebgp,
    records,
    anchors,
    geo,
):
    candidates = [
        record["asn"]
        for record in records
        if (
            record["kind"] == "transit"
            and REAL_WORLD_IX in record["ixes"]
        )
    ]

    if not candidates:
        raise RuntimeError(
            f"No transit AS is connected to IX{REAL_WORLD_IX}."
        )

    provider_asn = (
        2
        if 2 in candidates
        else candidates[0]
    )

    exit_as = base.createAutonomousSystem(
        REAL_WORLD_ASN
    )

    router = exit_as.createRealWorldRouter(
        name="real-world",
        prefixes=[
            "0.0.0.0/1",
            "128.0.0.0/1",
        ],
    )

    router.joinNetwork(
        f"ix{REAL_WORLD_IX}",
        address=REAL_WORLD_ADDRESS,
    )

    ebgp.addPrivatePeerings(
        REAL_WORLD_IX,
        [provider_asn],
        [REAL_WORLD_ASN],
        PeerRelationship.Provider,
    )

    city = geo.near(
        anchors[REAL_WORLD_IX],
        3,
        15,
        "real-world",
    )

    set_geo(
        router,
        city,
        "real-world-router",
        source="anchor-offset-land-validated",
    )

    router.setLabel(
        "geo.anchor_ix",
        str(REAL_WORLD_IX),
    )

    # Keep the original real-world node name in container names.
    return {
        "asn": REAL_WORLD_ASN,
        "provider": provider_asn,
        "ix": REAL_WORLD_IX,
        "address": REAL_WORLD_ADDRESS,
    }


def build_emulator(seed=42, node_count=1000):
    host_counts = distribute_hosts(node_count)

    cities = load_cities()
    anchors = select_anchors(cities)
    edges = backbone(anchors)

    geo = GeoAllocator(
        cities,
        seed,
    )

    emu = Emulator()
    base = Base()
    ebgp = Ebgp()

    members = {
        ix: []
        for ix in anchors
    }

    records = []

    # 1. Create 20 IX route servers.
    for ix, city in anchors.items():
        exchange = base.createInternetExchange(
            ix,
            rsAddress=f"10.{ix}.0.254",
        )

        exchange.getPeeringLan().setDisplayName(
            f"{city[2]}-IX{ix}"
        )

        route_server = exchange.getRouteServerNode()

        set_geo(
            route_server,
            city,
            "ix-route-server",
        )

        route_server.setLabel(
            "geo.anchor_ix",
            str(ix),
        )

    # 2. One transit AS per backbone edge.
    #    19 edges => 19 transit ASes => 38 routers.
    for index, (ix_a, ix_b) in enumerate(edges):
        asn = 2 + index

        system = base.createAutonomousSystem(
            asn
        )

        system.createNetwork(
            "backbone",
            prefix=f"10.128.{index}.0/24",
        )

        # .1 is reserved for the Docker gateway.
        # Transit endpoints use .2 and .3.
        for endpoint, ix in enumerate(
            (ix_a, ix_b),
            start=2,
        ):
            available = [
                octet
                for octet in range(2, 253)
                if not (
                    ix == REAL_WORLD_IX
                    and octet == 177
                )
            ]

            member_index = len(members[ix])

            if member_index >= len(available):
                raise ValueError(
                    f"IX{ix} has no free transit address."
                )

            ix_address = (
                f"10.{ix}.0.{available[member_index]}"
            )

            router = system.createRouter(
                f"r{ix}"
            )

            router.joinNetwork(
                "backbone",
                address=f"10.128.{index}.{endpoint}",
            )

            router.joinNetwork(
                f"ix{ix}",
                address=ix_address,
            )

            router_city = geo.near(
                anchors[ix],
                30,
                180,
                f"AS{asn}-r{ix}",
            )

            set_geo(
                router,
                router_city,
                "transit-router",
                source="anchor-offset-land-validated",
            )

            router.setLabel(
                "geo.anchor_ix",
                str(ix),
            )
            router.setLabel(
                "geo.radius_km",
                f"{distance(router_city, anchors[ix]):.3f}",
            )

            members[ix].append(asn)

        records.append(
            {
                "asn": asn,
                "ixes": [ix_a, ix_b],
                "kind": "transit",
            }
        )

    for ix, peers in members.items():
        ebgp.addRsPeers(
            ix,
            list(dict.fromkeys(peers)),
        )

    # 3. One stub AS per IX; all additional nodes become hosts.
    for ix, asn in STUB_ASNS.items():
        system = base.createAutonomousSystem(
            asn
        )

        system.createNetwork(
            "net0",
            prefix=f"10.{asn}.0.0/24",
        )

        router = system.createRouter(
            "router0"
        )

        # .1 belongs to Docker, so use .2 for the simulated router.
        router.joinNetwork(
            "net0",
            address=f"10.{asn}.0.2",
        )

        router.joinNetwork(
            f"ix{ix}",
            address=f"10.{ix}.0.253",
        )

        router_city = geo.near(
            anchors[ix],
            20,
            120,
            f"AS{asn}-router",
        )

        set_geo(
            router,
            router_city,
            "stub-router",
            source="anchor-offset-land-validated",
        )

        router.setLabel(
            "geo.anchor_ix",
            str(ix),
        )

        for host_index in range(host_counts[ix]):
            hostname = f"host_{host_index}"
            octet = HOST_OCTETS[host_index]

            host = system.createHost(
                hostname
            )

            host.joinNetwork(
                "net0",
                address=f"10.{asn}.0.{octet}",
            )

            # Strict 500–2000 km range from the stub router for hosts.
            # Do not shrink the radius near coasts or islands.
            host_city = geo.near(
                router_city,
                HOST_MIN_RADIUS_KM,
                HOST_MAX_RADIUS_KM,
                hostname,
                allow_shrink=False,
                attempts_per_scale=HOST_GEO_ATTEMPTS,
            )

            set_geo(
                host,
                host_city,
                "stub-host",
                source="anchor-offset-land-validated",
            )

            host.setLabel(
                "geo.anchor_ix",
                str(ix),
            )
            host.setLabel(
                "geo.anchor_router",
                f"as{asn}/router0",
            )
            # At this radius a host may cross national boundaries.
            # Inherited city/country/region describe the anchor, not a
            # reverse-geocoded administrative location of the host.
            host.setLabel("geo.metadata_scope", "anchor")
            host.setLabel("geo.anchor_lat", f"{router_city[3]:.6f}")
            host.setLabel("geo.anchor_lon", f"{router_city[4]:.6f}")
            host.setLabel(
                "geo.radius_km",
                f"{geodesic(router_city[3:5], host_city[3:5]).km:.3f}",
            )

        records.append(
            {
                "asn": asn,
                "ixes": [ix],
                "kind": "stub",
            }
        )

    # 4. Explicit provider/customer sessions carry routes across ASes.
    for ix, provider, customer in transit_peerings(records):
        ebgp.addPrivatePeerings(
            ix,
            [provider],
            [customer],
            PeerRelationship.Provider,
        )

    # 5. Add one extra real-world router on IX102.
    exit_info = setup_real_world_exit(
        base,
        ebgp,
        records,
        anchors,
        geo,
    )

    # 6. Routing layers.
    for layer in (
        base,
        Routing(),
        ebgp,
        Ibgp(),
        Ospf(),
    ):
        emu.addLayer(layer)

    # 7. Reuse four hosts for DNS.
    setup_dns(emu)
    setup_ldns(emu)

    return (
        emu,
        records,
        anchors,
        host_counts,
        exit_info,
    )


class GeoDocker(Docker):
    def __init__(self, anchors, **kwargs):
        super().__init__(**kwargs)
        self.anchors = anchors

    def _getNetMeta(self, net):
        labels = super()._getNetMeta(net)
        scope, _, name = net.getRegistryInfo()

        if scope == "ix":
            ix = int(
                name.removeprefix("ix")
            )
            city = self.anchors[ix]

            for key, value in zip(
                ("geo.lat", "geo.lon"),
                city[3:5],
            ):
                labels += (
                    f'            {META}{key}: "{value:.6f}"\n'
                )

        return labels


def setup_morris_hosts(emu, docker):
    docker.addImage(
        DockerImage(
            "morris-worm-base",
            [],
            local=True,
        )
    )

    base = emu.getLayer("Base")
    configured = 0

    for asn in sorted(STUB_ASNS.values()):
        system = base.getAutonomousSystem(
            asn
        )

        for hostname in system.getHosts():
            if (
                (asn, hostname) in DNS_HOSTS
                or "dns-" in hostname
            ):
                continue

            host = system.getHost(
                hostname
            )

            docker.setImageOverride(
                host,
                "morris-worm-base",
            )

            host.appendStartCommand(
                "rm -f /root/.bashrc && cd /bof && ./server &"
            )

            configured += 1

    return configured


def check_container_files():
    container_files = (
        SCRIPT_DIR / "container_files"
    )

    image_dir = (
        container_files / "morris-worm-base"
    )

    if not image_dir.is_dir():
        raise FileNotFoundError(
            f"Missing image directory: {image_dir}"
        )

    for filename in (
        "z_start.sh",
        "z_build.sh",
    ):
        path = container_files / filename

        if not path.is_file():
            raise FileNotFoundError(
                f"Missing helper script: {path}"
            )

    return container_files


def copy_container_files(container_files, output):
    shutil.copytree(
        container_files / "morris-worm-base",
        output / "morris-worm-base",
        dirs_exist_ok=True,
    )

    for filename in (
        "z_start.sh",
        "z_build.sh",
    ):
        destination = output / filename

        shutil.copy2(
            container_files / filename,
            destination,
        )

        destination.chmod(
            destination.stat().st_mode
            | stat.S_IXUSR
            | stat.S_IXGRP
            | stat.S_IXOTH
        )


def print_summary(
    args,
    records,
    host_counts,
    exit_info,
    morris_host_count=None,
):
    total_hosts = sum(
        host_counts.values()
    )

    host_distribution = Counter(
        host_counts.values()
    )

    print()
    print(
        f"Simulation nodes: {args.nodes + 1} "
        f"({args.nodes} topology nodes + 1 real-world router)"
    )
    print(
        f"IX route servers: {IX_COUNT}"
    )
    print(
        f"Transit routers: {TRANSIT_ROUTER_COUNT}"
    )
    print(
        f"Stub routers: {STUB_ROUTER_COUNT}"
    )
    print(
        f"Hosts: {total_hosts}, "
        f"including {len(DNS_HOSTS)} DNS hosts"
    )
    print(
        f"Autonomous systems: {len(records) + 1}"
    )

    for count, number_of_ases in sorted(
        host_distribution.items()
    ):
        print(
            f"Host distribution: {number_of_ases} stub ASes "
            f"with {count} hosts each"
        )

    if morris_host_count is not None:
        print(
            f"Morris service hosts: {morris_host_count}"
        )

    print(
        f"Host radius: {HOST_MIN_RADIUS_KM:g}–"
        f"{HOST_MAX_RADIUS_KM:g} km from stub router"
    )
    print(
        "Host allocation starts at .71; "
        "DNS host_0 nodes move to .53."
    )

    print(
        "Root authoritative DNS: 10.150.0.53"
    )
    print(
        "COM authoritative DNS: 10.160.0.53"
    )
    print(
        "Recursive DNS: 10.163.0.53, 10.169.0.53"
    )
    print(
        "DNS record: worm.com -> 2.0.0.0"
    )

    print(
        f"Real-world exit: AS{exit_info['asn']} "
        f"on IX{exit_info['ix']}, "
        f"address {exit_info['address']}"
    )
    print(
        f"Exit provider: AS{exit_info['provider']}"
    )
    print(
        "Exit prefixes: 0.0.0.0/1, 128.0.0.0/1"
    )


def parse_args():
    parser = argparse.ArgumentParser(
        description=__doc__
    )

    parser.add_argument(
        "legacy_platform",
        nargs="?",
        choices=["amd", "arm"],
    )

    parser.add_argument(
        "--platform",
        choices=["amd", "arm"],
    )

    parser.add_argument(
        "--nodes",
        "--node-count",
        type=int,
        default=1000,
        help=(
            "Topology node count, excluding one extra real-world router. "
            f"Fixed routing core: {FIXED_NODE_COUNT}; "
            "all remaining nodes are hosts. "
            f"Range: {MIN_NODE_COUNT}..{MAX_NODE_COUNT}."
        ),
    )

    parser.add_argument(
        "--output",
        default=str(
            SCRIPT_DIR / "output"
        ),
    )

    parser.add_argument(
        "--dumpfile",
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=42,
    )

    parser.add_argument(
        "--override",
        dest="override",
        action="store_true",
        default=True,
    )

    parser.add_argument(
        "--no-override",
        dest="override",
        action="store_false",
    )

    args = parser.parse_args()

    args.platform = (
        args.platform
        or args.legacy_platform
        or "amd"
    )

    if not MIN_NODE_COUNT <= args.nodes <= MAX_NODE_COUNT:
        parser.error(
            f"--nodes must be between {MIN_NODE_COUNT} "
            f"and {MAX_NODE_COUNT}"
        )

    return args


def main():
    args = parse_args()

    container_files = None

    if not args.dumpfile:
        container_files = check_container_files()

    (
        emu,
        records,
        anchors,
        host_counts,
        exit_info,
    ) = build_emulator(
        seed=args.seed,
        node_count=args.nodes,
    )

    # Save the unrendered network, as in large-internet.py.
    # Docker image overrides are applied in the compilation branch.
    if args.dumpfile:
        dump_path = Path(
            args.dumpfile
        ).resolve()

        dump_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        emu.dump(
            str(dump_path)
        )

        print_summary(
            args,
            records,
            host_counts,
            exit_info,
        )

        print(
            f"Saved emulator: {dump_path}"
        )
        return 0

    platform = (
        Platform.AMD64
        if args.platform == "amd"
        else Platform.ARM64
    )

    docker = GeoDocker(
        anchors=anchors,
        internetMapEnabled=False,
        platform=platform,
    )

    morris_host_count = setup_morris_hosts(
        emu,
        docker,
    )

    emu.render()

    output = Path(
        args.output
    ).resolve()

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    emu.compile(
        docker,
        str(output),
        override=args.override,
    )

    # Keep SeedEMU's image build helper services.
    # remove_build_helpers(output)
    # validate_compose(output, args.nodes)

    copy_container_files(
        container_files,
        output,
    )

    print_summary(
        args,
        records,
        host_counts,
        exit_info,
        morris_host_count,
    )

    print(
        "Compose also includes compiler-generated image build helpers."
    )
    print(
        f"Docker output: {output}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
