#!/usr/bin/env python3
# encoding: utf-8

from __future__ import annotations

import argparse
from pathlib import Path
import sys


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from seedemu.compiler import Docker, Platform
from seedemu.core import Emulator
from seedemu.layers import Base, Ebgp, Ibgp, Ospf, PeerRelationship, Routing
from seedemu.utilities import Makers


# Approximate city centers on inhabited, non-desert land. These are illustrative
# locations, not the real locations of the emulated autonomous systems.
# IX peering-network positions (the stars on the map).
IX_LOCATIONS = {
    100: ("NYC", 40.712800, -74.006000),
    101: ("San Jose", 37.338200, -121.886300),
    102: ("Chicago", 41.878100, -87.629800),
    103: ("Miami", 25.761700, -80.191800),
    104: ("Boston", 42.360100, -71.058900),
    105: ("Houston", 29.760400, -95.369800),
}
# Display offsets for the actual IX route-server containers. Use nearby land
# cities instead of sharing the network's coordinates or offsetting offshore.
IX_CONTAINER_LOCATIONS = {
    100: ("Philadelphia", 39.9526, -75.1652),
    101: ("Santa Rosa", 38.4404, -122.7141),
    102: ("Rockford", 42.2711, -89.0940),
    103: ("West Palm Beach", 26.7153, -80.0534),
    104: ("Worcester", 42.2626, -71.8023),
    105: ("Huntsville TX", 30.7235, -95.5508),
}
STUB_EXCHANGES = {
    150: 100, 151: 100, 152: 101, 153: 101, 154: 102,
    160: 103, 161: 103, 162: 103, 163: 104, 164: 104,
    170: 105, 171: 105,
}
# Spread routers across regional cities, several hundred km from their IX.
# Explicit land locations avoid offshore/desert points from large circular offsets.
# Keys are IX IDs followed by ASNs, so placement does not depend on sort order.
ROUTER_LOCATIONS = {
    100: {
        2: ("Pittsburgh", 40.4406, -79.9959),
        3: ("Richmond", 37.5407, -77.4360),
        4: ("Syracuse", 43.0481, -76.1474),
        150: ("Harrisburg", 40.2732, -76.8867),
        151: ("Albany", 42.6526, -73.7562),
    },
    101: {
        2: ("Sacramento", 38.5816, -121.4944),
        12: ("Redding", 40.5865, -122.3917),
        152: ("Eugene", 44.0521, -123.0868),
        153: ("Fresno", 36.7378, -119.7871),
    },
    102: {
        2: ("Minneapolis", 44.9778, -93.2650),
        4: ("Detroit", 42.3314, -83.0458),
        11: ("St. Louis", 38.6270, -90.1994),
        154: ("Indianapolis", 39.7684, -86.1581),
    },
    103: {
        3: ("Orlando", 28.5383, -81.3792),
        160: ("Tallahassee", 30.4383, -84.2807),
        161: ("Gainesville", 29.6516, -82.3248),
        162: ("Atlanta", 33.7490, -84.3880),
    },
    104: {
        3: ("Montreal", 45.5017, -73.5673),
        4: ("Quebec City", 46.8139, -71.2080),
        12: ("Bangor", 44.8016, -68.7712),
        163: ("Burlington", 44.4759, -73.2121),
        164: ("Manchester", 42.9956, -71.4548),
    },
    105: {
        2: ("Dallas", 32.7767, -96.7970),
        3: ("Baton Rouge", 30.4515, -91.1871),
        11: ("Little Rock", 34.7465, -92.2896),
        170: ("Austin", 30.2672, -97.7431),
        171: ("Shreveport", 32.5252, -93.7502),
    },
}

# Hosts occupy regional land cities around their stub router, typically 100–300
# km away. For larger --hosts-per-as values, reuse these safe city centers rather
# than inventing unchecked offsets; multiple hosts may then share a location.
HOST_LOCATIONS = {
    150: [("State College", 40.7934, -77.8600), ("Allentown", 40.6084, -75.4902), ("Scranton", 41.4090, -75.6624)],
    151: [("Utica", 43.1009, -75.2327), ("Brattleboro", 42.8509, -72.5579), ("Poughkeepsie", 41.7004, -73.9210)],
    152: [("Salem", 44.9429, -123.0351), ("Roseburg", 43.2165, -123.3417), ("Portland", 45.5152, -122.6784)],
    153: [("Modesto", 37.6391, -120.9969), ("Stockton", 37.9577, -121.2908), ("Merced", 37.3022, -120.4830)],
    154: [("Louisville", 38.2527, -85.7585), ("Columbus", 39.9612, -82.9988), ("Fort Wayne", 41.0793, -85.1394)],
    160: [("Dothan", 31.2232, -85.3905), ("Albany GA", 31.5785, -84.1557), ("Valdosta", 30.8327, -83.2785)],
    161: [("Lakeland", 28.0395, -81.9498), ("Jacksonville", 30.3322, -81.6557), ("Sebring", 27.4956, -81.4409)],
    162: [("Birmingham", 33.5186, -86.8104), ("Chattanooga", 35.0456, -85.3097), ("Augusta", 33.4735, -82.0105)],
    163: [("Rutland", 43.6106, -72.9726), ("Sherbrooke", 45.4042, -71.8929), ("Lebanon NH", 43.6423, -72.2518)],
    164: [("Springfield", 42.1015, -72.5898), ("Waterville", 44.5520, -69.6317), ("Keene", 42.9337, -72.2781)],
    170: [("Waco", 31.5493, -97.1467), ("San Antonio", 29.4241, -98.4936), ("College Station", 30.6280, -96.3344)],
    171: [("Tyler", 32.3513, -95.3011), ("Texarkana", 33.4251, -94.0477), ("Monroe", 32.5093, -92.1193)],
}


def set_node_location(node, lat, lon, city):
    node.setGeo(lat, lon, city)
    # Docker adds the org.seedsecuritylabs.seedemu.meta. prefix itself.
    # setGeo alone is not exported by all SEED Emulator Docker versions.
    node.setLabel("geo.lat", f"{lat:.6f}")
    node.setLabel("geo.lon", f"{lon:.6f}")


def set_geographic_layout(base):
    routers_by_ix = {ix_id: [] for ix_id in IX_LOCATIONS}
    for asn in sorted(base.getAsns()):
        autonomous_system = base.getAutonomousSystem(asn)
        for name in sorted(autonomous_system.getRouters()):
            # Makers names transit routers r<ix_id>; stub ASes use router0.
            ix_id = STUB_EXCHANGES[asn] if asn in STUB_EXCHANGES else int(name[1:])
            routers_by_ix[ix_id].append(autonomous_system.getRouter(name))

    for ix_id, (city, lat, lon) in IX_LOCATIONS.items():
        exchange = base.getInternetExchange(ix_id)
        exchange.getPeeringLan().setDisplayName(f"{city}-{ix_id}")
        container_city, container_lat, container_lon = IX_CONTAINER_LOCATIONS[ix_id]
        set_node_location(
            exchange.getRouteServerNode(), container_lat, container_lon, container_city
        )
        routers = routers_by_ix[ix_id]
        for router in routers:
            router_city, router_lat, router_lon = ROUTER_LOCATIONS[ix_id][router.getAsn()]
            set_node_location(router, router_lat, router_lon, router_city)
            if router.getAsn() not in STUB_EXCHANGES:
                continue
            autonomous_system = base.getAutonomousSystem(router.getAsn())
            hosts = sorted(autonomous_system.getHosts())
            host_locations = HOST_LOCATIONS[router.getAsn()]
            for host_index, name in enumerate(hosts):
                host_city, host_lat, host_lon = host_locations[host_index % len(host_locations)]
                set_node_location(autonomous_system.getHost(name), host_lat, host_lon, host_city)


class GeographicDocker(Docker):
    """Export city coordinates on IX networks, which appear as map stars."""

    def _getNetMeta(self, net):
        labels = super()._getNetMeta(net)
        scope, _, name = net.getRegistryInfo()
        if scope == "ix" and name.startswith("ix"):
            location = IX_LOCATIONS.get(int(name[2:]))
            if location is not None:
                _, lat, lon = location
                labels += f'            org.seedsecuritylabs.seedemu.meta.geo.lat: "{lat:.6f}"\n'
                labels += f'            org.seedsecuritylabs.seedemu.meta.geo.lon: "{lon:.6f}"\n'
        return labels


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the B00 mini Internet example.")
    parser.add_argument("legacy_platform", nargs="?", choices=["amd", "arm"])
    parser.add_argument("--platform", choices=["amd", "arm"])
    parser.add_argument("--output", default=str(SCRIPT_DIR / "output"))
    parser.add_argument("--dumpfile")
    parser.add_argument("--hosts-per-as", type=int, default=2)
    parser.add_argument("--override", dest="override", action="store_true", default=True)
    parser.add_argument("--no-override", dest="override", action="store_false")
    parser.add_argument("--skip-render", dest="render", action="store_false", default=True)
    args = parser.parse_args()
    args.platform = args.platform or args.legacy_platform or "amd"
    return args


def resolve_platform(name: str) -> Platform:
    return Platform.AMD64 if name == "amd" else Platform.ARM64


def build_emulator(hosts_per_as=2) -> Emulator:
    emu = Emulator()
    ebgp = Ebgp()
    base = Base()

    ###############################################################################
    # Create internet exchanges
    for ix_id in IX_LOCATIONS:
        base.createInternetExchange(ix_id)

    ###############################################################################
    # Create Transit Autonomous Systems

    ## Tier 1 ASes
    Makers.makeTransitAs(
        base,
        2,
        [100, 101, 102, 105],
        [(100, 101), (101, 102), (100, 105)],
    )

    Makers.makeTransitAs(
        base,
        3,
        [100, 103, 104, 105],
        [(100, 103), (100, 105), (103, 105), (103, 104)],
    )

    Makers.makeTransitAs(
        base,
        4,
        [100, 102, 104],
        [(100, 104), (102, 104)],
    )

    ## Tier 2 ASes
    Makers.makeTransitAs(base, 11, [102, 105], [(102, 105)])
    Makers.makeTransitAs(base, 12, [101, 104], [(101, 104)])

    ###############################################################################
    # Create single-homed stub ASes.
    for asn, ix_id in STUB_EXCHANGES.items():
        Makers.makeStubAsWithHosts(emu, base, asn, ix_id, hosts_per_as)

    # An example to show how to add a host with customized IP address.
    as154 = base.getAutonomousSystem(154)
    new_host = as154.createHost("host_new").joinNetwork("net0", address="10.154.0.129")
    from seedemu.core import OptionMode, OptionRegistry

    o = OptionRegistry().sysctl_netipv4_conf_rp_filter(
        {"all": False, "default": False, "net0": False},
        mode=OptionMode.RUN_TIME,
    )
    new_host.setOption(o)

    o = OptionRegistry().sysctl_netipv4_udp_rmem_min(5000, mode=OptionMode.RUN_TIME)
    new_host.setOption(o)

    set_geographic_layout(base)

    ###############################################################################
    # Peering via route servers.
    ebgp.addRsPeers(100, [2, 3, 4])
    ebgp.addRsPeers(102, [2, 4])
    ebgp.addRsPeers(104, [3, 4])
    ebgp.addRsPeers(105, [2, 3])

    # Private peerings for transit service.
    ebgp.addPrivatePeerings(100, [2], [150, 151], PeerRelationship.Provider)
    ebgp.addPrivatePeerings(100, [3], [150], PeerRelationship.Provider)

    ebgp.addPrivatePeerings(101, [2], [12], PeerRelationship.Provider)
    ebgp.addPrivatePeerings(101, [12], [152, 153], PeerRelationship.Provider)

    ebgp.addPrivatePeerings(102, [2, 4], [11, 154], PeerRelationship.Provider)
    ebgp.addPrivatePeerings(102, [11], [154], PeerRelationship.Provider)

    ebgp.addPrivatePeerings(103, [3], [160, 161, 162], PeerRelationship.Provider)

    ebgp.addPrivatePeerings(104, [3, 4], [12], PeerRelationship.Provider)
    ebgp.addPrivatePeerings(104, [4], [163], PeerRelationship.Provider)
    ebgp.addPrivatePeerings(104, [12], [164], PeerRelationship.Provider)

    ebgp.addPrivatePeerings(105, [3], [11, 170], PeerRelationship.Provider)
    ebgp.addPrivatePeerings(105, [11], [171], PeerRelationship.Provider)

    ###############################################################################
    # Add layers to the emulator

    emu.addLayer(base)
    emu.addLayer(Routing())
    emu.addLayer(ebgp)
    emu.addLayer(Ibgp())
    emu.addLayer(Ospf())
    return emu


def run(
    dumpfile=None,
    hosts_per_as=2,
    output=None,
    platform=Platform.AMD64,
    override=True,
    render=True,
):
    emu = build_emulator(hosts_per_as=hosts_per_as)
    if dumpfile is not None:
        # Save it to a file, so it can be used by other emulators.
        emu.dump(dumpfile)
        return

    if render:
        emu.render()

    docker = GeographicDocker(platform=platform)
    emu.compile(docker, output or "./output", override=override)


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output).resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    run(
        dumpfile=args.dumpfile,
        hosts_per_as=args.hosts_per_as,
        output=str(output_dir),
        platform=resolve_platform(args.platform),
        override=args.override,
        render=args.render,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
