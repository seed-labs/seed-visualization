from seedemu.layers import Base, Routing, Ebgp, Ibgp, Ospf, PeerRelationship
from seedemu.compiler import Docker, Platform
from seedemu.core import Emulator
import os
import sys
import networkx as nx
import re
import pickle
from typing import List, Tuple, Dict
from seedemu.layers import Base, Ebgp, Routing, Ibgp, Ospf
from seedemu.layers.Ebgp import PeerRelationship
from seedemu.core import Binding, Filter, Emulator, Service, Router, AutonomousSystem
from typing import List, Tuple, Dict
import time
import threading
import psutil
from datetime import datetime
from ipaddress import IPv4Address,IPv4Network
import random
from seedemu.services import TrafficService, TrafficServiceType
from seedemu.layers import EtcHosts
import argparse
with open("assignment.pkl", "rb") as f:
    assignment = pickle.load(f)
node_prefix={}
for key,value in assignment.items():
    node_prefix[value['asn']]=value['ipv4']

def add_traffic(base, emu, stubAS, assignment_temp, num=10):
    etc_hosts = EtcHosts()
    traffic_service = TrafficService()
    for i in range(num):
        asnum1=assignment_temp[stubAS[3*i]]['asn']
        asnum2=assignment_temp[stubAS[3*i+1]]['asn']
        asnum3=assignment_temp[stubAS[3*i+2]]['asn']

        receiver1=f"iperf-receiver-{i}-1"
        receiver2=f"iperf-receiver-{i}-2"
        traffic_service.install(receiver1, TrafficServiceType.IPERF_RECEIVER, log_file="/root/iperf3_receiver.log")
        traffic_service.install(receiver2, TrafficServiceType.IPERF_RECEIVER, log_file="/root/iperf3_receiver.log")
        traffic_service.install(
            f"iperf-generator-{i}",
            TrafficServiceType.IPERF_GENERATOR,
            log_file="/root/iperf3_generator.log",
            protocol="TCP",
            duration=36000,
            rate=0
        ).addReceivers(hosts=[receiver1, receiver2])
        
        # Add hosts to AS-150

        as1 = base.getAutonomousSystem(asnum1)
        as1.createHost(f"iperf-generator-{i}").joinNetwork("net0")

        # Add hosts to AS-162
        as2 = base.getAutonomousSystem(asnum2)
        as2.createHost(f"iperf-receiver-{i}-1").joinNetwork("net0")

        # Add hosts to AS-171
        as3 = base.getAutonomousSystem(asnum3)
        as3.createHost(f"iperf-receiver-{i}-2").joinNetwork("net0")
        emu.addBinding(
            Binding(f"iperf-generator-{i}", filter=Filter(asn=asnum1, nodeName=f"iperf-generator-{i}"))
        )
        emu.addBinding(
            Binding(receiver1, filter=Filter(asn=asnum2, nodeName=receiver1))
        )
        emu.addBinding(
            Binding(receiver2, filter=Filter(asn=asnum3, nodeName=receiver2))
        )

    # Add the layers
    emu.addLayer(traffic_service)
    emu.addLayer(etc_hosts)

def get_assignment(asn,assignment=assignment):
    t=len(assignment)
    if asn not in assignment.keys():
        assignment[asn]={'asn':t+1,'ipv4':f'{(t+1) //256}.{(t+1) %256}.0.0/16'}
    return assignment
def update_topology_from_file(TOPOLOGY_DATA,max_new_asns=100):
    """
    Update the topology with data read from a file.
    :param max_new_asns: Maximum number of ASes that may be added.
    """
    
    db_filename = '201603modified.txt'
    
    print(f"Analyzing unused IXPs... (maximum new ASes: {max_new_asns})")

    # 2. Find IXPs that do not appear in as_as_ix_edges.
    # as_as_ix_edges structure: [(as1, as2, ixp, rel), ...]; ixp is at index 2.
    used_ixps = set(edge[2] for edge in TOPOLOGY_DATA['as_as_ix_edges'])
    # Select unused IXPs.
    unused_ixps = [ixp for ixp in TOPOLOGY_DATA['ixps'] if ixp not in used_ixps]
    
    if not unused_ixps:
        print("No unused IXP was found; no update is required.")
        return TOPOLOGY_DATA

    # 3. Find the transit AS connected to each unused IXP (variable a).
    # Build a mapping: {Transit_AS_a: [IXP_1, IXP_2, ...]}.
    # When AS0 == Transit_AS_a, only the corresponding IXPs need to be checked.
    as_to_target_ixps = {}
    
    count_mapped = 0
    for ixp in unused_ixps:
        connected_as = None
        # ix_ix_transit_edges structure: [(ixp1, ixp2, as, 0)].
        for edge in TOPOLOGY_DATA['ix_ix_transit_edges']:
            ixp1, ixp2, asn, _ = edge
            if ixp == ixp1 or ixp == ixp2:
                # Convert the ASN to an integer.
                connected_as = int(asn)
                break
        
        if connected_as is not None:
            if connected_as not in as_to_target_ixps:
                as_to_target_ixps[connected_as] = []
            as_to_target_ixps[connected_as].append(ixp)
            count_mapped += 1
    
    print(f"Found {len(unused_ixps)} unused IXPs; {count_mapped} were mapped to transit ASes.")
    print("Scanning 201603modified.txt for matches...")

    # 4. Scan the file for entries matching (a|X|ixp,-1).
    # Cache existing stub ASes to avoid repeated membership checks.
    existing_stubs = set(TOPOLOGY_DATA['stub_asns'])
    existing_transits = set(TOPOLOGY_DATA['transit_asns'])
    
    new_edges_count = 0
    added_asns_count = 0  # Number of newly added ASes.

    with open(db_filename, 'r', encoding='utf-8') as f:
        for line in f:
            # Stop after reaching the configured limit.
            if added_asns_count >= max_new_asns:
                print(f"Reached the maximum number of new ASes ({max_new_asns}); stopping.")
                break

            line = line.strip()
            # Ignore blank lines and comments.
            if not line or line.startswith('#'):
                continue
            
            parts = line.split('|')
            if len(parts) < 3:
                continue
            
            # Read AS0 (variable a).
            try:
                as0 = int(parts[0])
            except ValueError:
                continue  # Skip nonnumeric AS values.
            
            # Process rows whose AS0 is one of the target transit ASes.
            if as0 in as_to_target_ixps:
                target_ixps = as_to_target_ixps[as0]
                
                # Read the remainder of the row (loc, source, ...).
                # parts[0] is AS0, parts[1] is AS1 (variable X), and parts[2:] contains location data.
                try:
                    as1 = int(parts[1])  # Variable X.
                except ValueError:
                    continue

                # Check every unused IXP associated with this AS.
                for ixp in target_ixps:
                    # Construct the search value "ixp,-1".
                    # Convert the IXP to a string so it matches the file content.
                    search_target = f"{ixp},-1"
                    
                    # Search the remaining fields for a match.
                    is_match = False
                    for segment in parts[2:]:
                        if search_target in segment:
                            is_match = True
                            break
                    
                    if is_match:
                        # 5. Add the matching relationship.
                        
                        # Determine whether this is a new AS.
                        is_new_as = as1 not in existing_stubs and as1 not in existing_transits

                        if is_new_as:
                            # Recheck the limit in case one row triggers multiple additions.
                            if added_asns_count >= max_new_asns:
                                break  # Leave the inner loop; the outer loop checks the limit next.

                            TOPOLOGY_DATA['stub_asns'].append(str(as1))
                            existing_stubs.add(as1)  # Update the cache.
                            added_asns_count += 1
                        
                            # Add edge (a, X, ixp, -1) as (as0, as1, ixp, -1).
                            new_edge = (str(as0), str(as1), ixp, '-1')
                            # Avoid duplicate edges.
                            if new_edge not in TOPOLOGY_DATA['as_as_ix_edges']:
                                TOPOLOGY_DATA['as_as_ix_edges'].append(new_edge)
                                new_edges_count += 1
                                # print(f"Added edge: {new_edge}")
                
                # Leave the outer loop if the inner loop reached the limit.
                if added_asns_count >= max_new_asns:
                    break
    
    print(f"Processing complete: added {added_asns_count} ASes and {new_edges_count} AS-AS-IX edges.")
    return TOPOLOGY_DATA

def generate_connected_pairs(nodes, extra_edges_count=0):
    """
    Generate random node pairs while keeping the graph connected.
    :param nodes: List of nodes.
    :param extra_edges_count: Number of random edges to add after connectivity is guaranteed.
    """
    if len(nodes) < 2:
        return []
    elif len(nodes) == 2:
        return [tuple(sorted((nodes[0], nodes[1])))]
    
    pairs = set()  # Use a set to avoid duplicate edges.
    for i in range(len(nodes)):
        pair1 = tuple(sorted((nodes[i],nodes[(i + 1) % len(nodes)])))
        pairs.add(pair1)
    for i in range(len(nodes)):
        if len(pairs)<254:
            break;
        if i!= (int(i + 1+len(nodes)/2) % len(nodes)):
            pair2 = tuple(sorted((nodes[i],nodes[int(i + 1+len(nodes)/2) % len(nodes)])))
            pairs.add(pair2)
    
    # # 3. Optionally add random edges to increase network complexity.
    # # Set extra_edges_count to 0 when only basic connectivity is needed.
    # current_edge_count = len(pairs)
    # max_edges = len(nodes) * (len(nodes) - 1) // 2  # Edge count of a complete graph.
    
    # # Do not request more additional edges than the graph can contain.
    # target_count = min(current_edge_count + extra_edges_count, max_edges)
    
    # while len(pairs) < target_count:
    #     # Select two distinct nodes at random.
    #     u, v = random.sample(nodes, 2)
    #     pair = tuple(sorted((u, v)))
        
    #     # The set automatically ignores an edge that already exists.
    #     pairs.add(pair)

    return list(pairs)

def makeStubAsWithHosts(emu: Emulator, base: Base, asn: int, prefix: str, exchange: int, hosts_total: int):

    # Create AS and internal network
    network = "net0"

    stub_as = base.createAutonomousSystem(asn)
    stub_as.createNetwork(network,prefix)

    # Create a BGP router
    # Attach the router to both the internal and external networks
    router = stub_as.createRouter('r{}'.format(exchange))
    router.joinNetwork(network)
    router.joinNetwork('ix{}'.format(exchange),str(IPv4Network(node_prefix[exchange])[asn]))

    for counter in range(hosts_total):
       name = 'host_{}'.format(counter)
       host = stub_as.createHost(name)
       host.joinNetwork(network)

def makeTransitAs(base: Base, asn: int, prefix: str, exchanges: List[int],
    intra_ix_links: List[Tuple[int, int]],node_prefix=node_prefix,rrNum=0) -> AutonomousSystem:
    """!
    @brief create a transit AS.

    @param base reference to the base layer.
    @param asn ASN of the newly created AS.
    @param exchanges list of IXP IDs to join.
    @param intra_ix_links list of tuple of IXP IDs, to create intra-IX links at.

    @returns transit AS object.
    """

    transit_as = base.createAutonomousSystem(asn)
    #transit_as.setSubnets(prefix)
    routers: Dict[int, Router] = {}

    # Create a BGP router for each internet exchange (for peering purpose)
    for ix in exchanges:
        routers[ix] = transit_as.createRouter('r{}'.format(ix))
        routers[ix].addSoftware("iperf3")  #####################################################
        routers[ix].joinNetwork('ix{}'.format(ix),str(IPv4Network(node_prefix[ix])[asn]))
        #print(ix,str(IPv4Network(node_prefix[ix])[asn]))
        #raise ValueError
    if(rrNum==1):
        rr_index= list(routers.keys())[0]
        routers[rr_index].makeRouteReflector(True)
    elif(rrNum>1):
        for i in range(rrNum):
            transit_as.createCluster(f'10.0.0.{i+1}')
        index=0
        for key,value in routers.items():
            if index<rrNum:
                value.makeRouteReflector(True)
                value.joinBgpCluster(f'10.0.0.{index+1}')
                index+=1
            else:
                value.joinBgpCluster(f'10.0.0.{index%rrNum+1}')
                index+=1
    # For each pair, create an internal network to connect the BGP routers
    # from two internet exchanges. There is no need to create a full-mesh
    # network among the BGP routers. As long as they can reach each other
    # over a single or multiple hops, it is OK.
    t=len(intra_ix_links)
    i=1
    subnets=list(IPv4Network(prefix).subnets(prefixlen_diff=8))
    for (a, b) in intra_ix_links:
        assert i<255, "net >= 255"
        name = 'net_{}_{}'.format(a, b)
        transit_as.createNetwork(name,str(subnets[i]))
        routers[a].joinNetwork(name)#,str(subnets[i][253])
        routers[b].joinNetwork(name)#,str(subnets[i][254])
        i+=1

    return transit_as

def find_maximal_cliques(edge_list):
    # 1. Create an undirected graph.
    G = nx.Graph()

    # 2. Add every edge in the input list to the graph.
    G.add_edges_from(edge_list)


    # 3. Find all maximal cliques in graph G.
    # nx.find_cliques(G) returns a generator whose elements are sets.
    cliques_generator = nx.find_cliques(G)

    # 4. Convert the result to a list and sort each clique for readability.
    #    sorted(list(clique)) produces the expected output format.
    result = [sorted(list(clique)) for clique in cliques_generator]
    return result

def load_topology_data(filename: str) -> dict:
    """Load topology data from a file that uses the ``key: value`` format."""
    with open(filename, 'r') as f:
        content = f.read().strip()
    
    # Normalize the format by adding outer braces and quoting keys.
    # 1. Replace key: with "key":.
    content = re.sub(r'^(\w+):', r'"\1":', content, flags=re.MULTILINE)
    # 2. Add a comma to every line except the last one.
    lines = content.split('\n')
    lines = [line + ',' for line in lines[:-1]] + [lines[-1]] if lines else []
    content = '\n'.join(lines)
    # 3. Wrap the content as a dictionary.
    content = '{' + content + '}'
    
    # Parse the normalized content as a dictionary.
    try:
        return eval(content)  # The normalized text now follows Python dictionary syntax.
    except Exception as e:
        raise ValueError(f"Failed to parse topology data: {e}")

def run(dumpfile=None, hosts_per_as=2): 
    # Set the platform information
    if dumpfile is None:
        script_name = os.path.basename(__file__)
        platform = Platform.AMD64
        parser = argparse.ArgumentParser(description="Compile a five-line SeedEMU topology")
        parser.add_argument("x", nargs="?", type=int, default=214, help="legacy topology size")
        parser.add_argument(
            "--topology-file",
            default=None,
            help="explicit topology file; defaults to real_topology_<x>.txt",
        )
        parser.add_argument(
            "--output-dir",
            default=None,
            help="explicit compiler output directory",
        )
        args = parser.parse_args()
        x = args.x
        topology_file = args.topology_file or f"real_topology_{x}.txt"
        output_dir = args.output_dir or f"./output_{x}_exportAll"
        print(f"Received x parameter: {x}")
        print(f"Topology input file: {topology_file}")
        print(f"Compilation output directory: {output_dir}")
    else:
        x = 214
        topology_file = f"real_topology_{x}.txt"
        output_dir = f"./output_{x}_exportAll"

    # Load topology data.
    try:
        TOPOLOGY_DATA = load_topology_data(topology_file)
        #TOPOLOGY_DATA = load_topology_data('real_topology_1897.txt')
        #TOPOLOGY_DATA = update_topology_from_file(TOPOLOGY_DATA,max_new_asns=100)
    except FileNotFoundError:
        print("Error: real_topology_1078.txt was not found")
        sys.exit(1)
    except Exception as e:
        print(f"Failed to parse topology data: {e}")
        sys.exit(1)

    
    emu   = Emulator()
    ebgp  = Ebgp()
    base  = Base()
    
    ###############################################################################
    # Create Internet exchange points (IXPs).
    ix_objects = {}
    for ixp in TOPOLOGY_DATA["ixps"]:
        prefix = assignment[ixp]['ipv4']
        ix = assignment[ixp]['asn']
        address=str(IPv4Network(prefix)[ix])
        ix_obj = base.createInternetExchange(ix,prefix,rsAddress=address)
        ix_obj.getPeeringLan().setDisplayName(f'IX-{ix}')  # Set the display name.
        ix_objects[ix] = ix_obj
        print(f"Created IXP {ix} (display name: IX-{ix})")
    
    ###############################################################################
    # Collect transit-AS connectivity information.
    transit_info = {}
    for asn in TOPOLOGY_DATA["transit_asns"]:
        asn = assignment[asn]['asn']
        connected_ixs = set()
        intra_links = []
        for (ix_a, ix_b, t_asn, _) in TOPOLOGY_DATA["ix_ix_transit_edges"]:
            ix_a = assignment[ix_a]['asn']
            ix_b = assignment[ix_b]['asn']
            t_asn = assignment[t_asn]['asn']
            if t_asn == asn:
                connected_ixs.add(ix_a)
                connected_ixs.add(ix_b)
                intra_links.append((ix_a, ix_b))
        transit_info[asn] = (sorted(connected_ixs), intra_links)
    # with open("transit_info.pkl", "rb") as f:
    #     transit_info = pickle.load(f)
    
    ###############################################################################
    # Create transit autonomous systems.
    Aslist=[3,1,0]
    index =0
    for asnuber in TOPOLOGY_DATA["transit_asns"]:
        asn = assignment[asnuber]['asn']
        prefix = assignment[asnuber]['ipv4']
        exchanges, intra_links = transit_info[asn]
        # temp=find_maximal_cliques(intra_links)
        # links=[]
        # for clique in temp:
        #     links.extend([(clique[i], clique[(i + 1) % len(clique)]) for i in range(len(clique))])
        links=[]
        clique=sorted(exchanges)
        links=generate_connected_pairs(clique, min(2*len(clique),253-len(clique)))
        makeTransitAs(base, asn, prefix, exchanges, list(set(links)),rrNum=1)
        print(f"Created transit AS{asn}: IXPs={exchanges}, internal links={links}")
        index+=1
    
    ###############################################################################
    # Create stub ASes and add hosts.

    stub_ix_map = {}
    for (provider, customer, ix, rel) in TOPOLOGY_DATA["as_as_ix_edges"]:
        if rel == '-1' and customer in TOPOLOGY_DATA["stub_asns"]:
            stub_ix_map[customer] = ix
    print(TOPOLOGY_DATA["stub_asns"])
    assignment_temp=assignment.copy()
    for stub_asn in TOPOLOGY_DATA["stub_asns"]:
        assignment_temp=get_assignment(stub_asn,assignment_temp)
        asn=assignment_temp[stub_asn]['asn']
        prefix=assignment_temp[stub_asn]['ipv4']
        ix = assignment_temp[stub_ix_map[stub_asn]]['asn']
        makeStubAsWithHosts(emu, base, asn, prefix, ix, hosts_total=0)
        print(f"Created stub AS{asn}: IXP={ix}, host count={hosts_per_as}")
    
    # Configure private peerings.
    for (a, b, ix, rel) in TOPOLOGY_DATA["as_as_ix_edges"]:
        a = assignment_temp[a]['asn']
        b = assignment_temp[b]['asn']
        ix = assignment_temp[ix]['asn']
        rel = int(rel)
        # Convert relationships: -1 to Provider, 0 to Peer.
        if rel == -1:
            relationship = PeerRelationship.Provider
        elif rel == 0:
            relationship = PeerRelationship.Peer###########
        else:
            raise ValueError(f"Invalid relationship value: {rel} (only -1 and 0 are supported)")
        
        ebgp.addPrivatePeerings(ix, [a], [b], relationship)
        print(f"Configured private peering at IXP{ix}: AS{a} and AS{b} (relationship: {rel})")

    #add_traffic(base, emu, TOPOLOGY_DATA["stub_asns"], assignment_temp, num=5)
    t=time.time()

    print("Compiling the emulated network...")
    ######################################################
    # #########################
    # Add all layers to the emulator.
    emu.addLayer(base)
    emu.addLayer(Routing())
    emu.addLayer(ebgp)
    emu.addLayer(Ibgp())
    emu.addLayer(Ospf())
    
    ###############################################################################
    # Write the result.
    if dumpfile is not None:
        # Save to a file for use by other emulators.
        emu.dump(dumpfile)
    else:
        emu.render()
        # Attach the Internet Map container and compile.
        docker = Docker(platform=platform)
        emu.compile(docker, output_dir, override=True)#f'real_topology_{x}.txt'
        print(f"Emulated network compilation completed; output directory: {output_dir}")
    print(f"Compilation time: {time.time()-t} seconds")

if __name__ == "__main__":
    run()
