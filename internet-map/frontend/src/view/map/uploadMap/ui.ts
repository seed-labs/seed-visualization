import {DataSource} from './datasource.ts';
import type {VisData} from '@/utils/types.ts';
import {MapUi as BaseMapUi} from "@/utils/map-ui.ts";
import type {MapUiConfiguration} from "@/utils/map-ui.ts";
import {type Edge, type Vertex} from '@/utils/map-datasource.ts';
import {DataSet} from "vis-data";
import {dealTransitWeight} from "@/utils/tools.ts";

export interface UploadMapUiOtherConfiguration {

}

function edgeKey(from: string, to: string): string {
    return from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`;
}

export function filterGraphByIXData(nodes: Vertex[], edges: Edge[], selectedStarLabels: string[]): { filteredNodes: Vertex[]; filteredEdges: Edge[] } {
    if (selectedStarLabels.length === 0) {
        return {
            filteredNodes: [],
            filteredEdges: [],
        };
    }

    const nodeMap = new Map<string, Vertex>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    const selectedStarIds = new Set<string>();
    const selectedStarLabelsSet = new Set(selectedStarLabels);

    const allStarIds = new Set<string>();

    nodes.forEach(node => {
        if (node.shape === 'star') {
            allStarIds.add(node.id);
            const starName = node.object?.meta?.emulatorInfo?.name;
            if (starName && selectedStarLabelsSet.has(starName)) {
                selectedStarIds.add(node.id);
            }
        }
    });

    const adjacencyList = new Map<string, Set<string>>();
    nodes.forEach(node => adjacencyList.set(node.id, new Set()));
    edges.forEach(edge => {
        adjacencyList.get(edge.from)?.add(edge.to);
        adjacencyList.get(edge.to)?.add(edge.from);
    });

    const nodesToKeep = new Set<string>(selectedStarIds);
    const edgesToKeep = new Set<string>();
    const directlyConnectedStars = new Set<string>();

    selectedStarIds.forEach(starId => {
        const queue: { nodeId: string; path: string[]; fromStar: string }[] = [
            {nodeId: starId, path: [starId], fromStar: starId}
        ];

        const visited = new Set<string>([starId]);

        while (queue.length > 0) {
            const {nodeId, path, fromStar} = queue.shift()!;
            const neighbors = adjacencyList.get(nodeId) || new Set();

            for (const neighborId of neighbors) {
                if (path.includes(neighborId)) continue;

                const isStar = allStarIds.has(neighborId);
                const neighborNode = nodeMap.get(neighborId);
                const isDot = neighborNode?.shape === 'dot';
                const isDiamond = neighborNode?.shape === 'diamond';

                if (isStar && neighborId !== fromStar) {
                    if (!selectedStarIds.has(neighborId)) {
                        directlyConnectedStars.add(neighborId);
                        const fullPath = [...path, neighborId];
                        for (let i = 0; i < fullPath.length - 1; i++) {
                            const currentId = fullPath[i]!;
                            const nextId = fullPath[i + 1]!;
                            edgesToKeep.add(edgeKey(currentId, nextId));
                        }
                        fullPath.forEach(id => nodesToKeep.add(id));
                    }
                    continue;
                }

                if (isDot || isDiamond || !isStar) {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        edgesToKeep.add(edgeKey(nodeId, neighborId));
                        nodesToKeep.add(neighborId);

                        queue.push({
                            nodeId: neighborId,
                            path: [...path, neighborId],
                            fromStar: fromStar
                        });
                    }
                }
            }
        }
    });

    directlyConnectedStars.forEach(starId => {
        const neighbors = adjacencyList.get(starId) || new Set();
        neighbors.forEach(neighborId => {
            const neighborNode = nodeMap.get(neighborId);
            const isDot = neighborNode?.shape === 'dot';
            const isHexagon = neighborNode?.shape === 'hexagon';

            if (isDot || isHexagon) {
                nodesToKeep.add(neighborId);
                edgesToKeep.add(edgeKey(starId, neighborId));
            }
        });
    });

    selectedStarIds.forEach(id => nodesToKeep.add(id));
    const filteredNodes: Vertex[] = nodes.filter(node => nodesToKeep.has(node.id));
    const filteredEdges: Edge[] = [];
    const addedEdges = new Set<string>();

    edges.forEach(edge => {
        const key = edgeKey(edge.from, edge.to);

        if (edgesToKeep.has(key) && !addedEdges.has(key)) {
            filteredEdges.push({...edge});
            addedEdges.add(key);
        }
    });

    return {
        filteredNodes,
        filteredEdges,
    };
}

export function filterGraphByIXRoutersData(nodes: Vertex[], edges: Edge[], selectedStarLabels: string[]): { filteredNodes: Vertex[]; filteredEdges: Edge[] } {
    if (selectedStarLabels.length === 0) {
        return {
            filteredNodes: [],
            filteredEdges: [],
        };
    }

    const selectedStarLabelsSet = new Set(selectedStarLabels);
    const nodeMap = new Map<string, Vertex>();
    const selectedStarIds = new Set<string>();
    const nodesToKeep = new Set<string>();
    const edgesToKeep = new Set<string>();
    const adjacencyList = new Map<string, Edge[]>();

    const isRouterNode = (node?: Vertex) => {
        if (node?.type !== 'node') return false;
        const role = (node.object as any)?.meta?.emulatorInfo?.role;
        return node?.shape === 'dot' && ['Router', 'BorderRouter'].includes(role);
    };
    const isLocalNetwork = (node?: Vertex) => node?.shape === 'diamond';

    nodes.forEach(node => {
        nodeMap.set(node.id, node);
        adjacencyList.set(node.id, []);
        const starName = node.object?.meta?.emulatorInfo?.name;
        if (node.shape === 'star' && starName && selectedStarLabelsSet.has(starName)) {
            selectedStarIds.add(node.id);
            nodesToKeep.add(node.id);
        }
    });

    edges.forEach(edge => {
        adjacencyList.get(edge.from)?.push(edge);
        adjacencyList.get(edge.to)?.push(edge);

        const fromIsSelectedStar = selectedStarIds.has(edge.from);
        const toIsSelectedStar = selectedStarIds.has(edge.to);
        if (!fromIsSelectedStar && !toIsSelectedStar) return;

        const directNodeId = fromIsSelectedStar ? edge.to : edge.from;
        const directNode = nodeMap.get(directNodeId);
        if (!isRouterNode(directNode)) return;

        nodesToKeep.add(directNodeId);
        edgesToKeep.add(edgeKey(edge.from, edge.to));
    });

    const directRouterIds = Array.from(nodesToKeep).filter(id => isRouterNode(nodeMap.get(id)));
    directRouterIds.forEach(startRouterId => {
        const startRouter = nodeMap.get(startRouterId);
        const startGroup = String(startRouter?.group ?? '');
        const visited = new Set<string>([startRouterId]);
        const queue = [startRouterId];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            for (const edge of adjacencyList.get(currentId) ?? []) {
                const nextId = edge.from === currentId ? edge.to : edge.from;
                if (visited.has(nextId)) continue;

                const nextNode = nodeMap.get(nextId);
                const currentNode = nodeMap.get(currentId);
                const canVisitNetwork = isRouterNode(currentNode) && isLocalNetwork(nextNode);
                const canVisitRouter = isLocalNetwork(currentNode)
                    && isRouterNode(nextNode)
                    && String(nextNode?.group ?? '') === startGroup;

                if (!canVisitNetwork && !canVisitRouter) continue;

                visited.add(nextId);
                nodesToKeep.add(nextId);
                edgesToKeep.add(edgeKey(edge.from, edge.to));

                if (isRouterNode(nextNode) || isLocalNetwork(nextNode)) {
                    queue.push(nextId);
                }
            }
        }
    });

    const filteredNodes = nodes.filter(node => nodesToKeep.has(node.id));
    const filteredEdges: Edge[] = [];
    const addedEdges = new Set<string>();

    edges.forEach(edge => {
        const key = edgeKey(edge.from, edge.to);
        if (edgesToKeep.has(key) && !addedEdges.has(key)) {
            filteredEdges.push({...edge});
            addedEdges.add(key);
        }
    });

    return {
        filteredNodes,
        filteredEdges,
    };
}

/**
 * map UI controller.
 */
export class MapUi extends BaseMapUi {
    public otherConfig: UploadMapUiOtherConfiguration

    constructor(config: MapUiConfiguration, otherConfig: UploadMapUiOtherConfiguration) {
        super(config)
        this.otherConfig = otherConfig;
        this._datasource = config.datasource as DataSource;
    }

    setVisData(data: VisData) {
        ;(this._datasource as any).setVisData(data)
    }

    getIxs() {
        return this._datasource.ixs;
    }

    getTransits() {
        return this._datasource.transits;
    }

    private edgeKey(from: string, to: string): string {
        return edgeKey(from, to);
    }

    setGraphEdgeEvent(tooltipContent: { value: string }, tooltipVisible: { value: boolean }, position: { value: { x: number; y: number } }) {
        const intervalHandle = setInterval(() => {
            if (!this._graph) {
                return
            }
            this._graph.on('hoverEdge', (params: any) => {
                const edgeId = params.edge;
                const edge = this._edges.get(edgeId) as any;

                if (edge && edge.fullLabel) {
                    position.value = DOMRect.fromRect({
                        x: params.pointer.DOM.x,
                        y: params.pointer.DOM.y,
                    })
                    tooltipContent.value = edge.fullLabel;
                    tooltipVisible.value = true;
                }
            });
            this._graph.on('blurEdge', () => {
                tooltipVisible.value = false;
            });
            clearInterval(intervalHandle)
        }, 1000)
    }

    filterGraphByIX(selectedStarLabels: string[]): { filteredNodes: Vertex[]; filteredEdges: Edge[] } {
        return filterGraphByIXData(this._datasource.vertices, this._datasource.edges, selectedStarLabels)
    }

    filterGraphByIXNum(ixNumber: number): { filteredNodes: Vertex[], filteredEdges: Edge[] } {
        const selectedStarLabels = this.getIxs().map(v => v.meta.emulatorInfo.name).slice(0, ixNumber)
        return this.filterGraphByIX(selectedStarLabels)
    }

    filterGraphByTransit(selectedGroups: string[]): { filteredNodes: Vertex[]; filteredEdges: Edge[] } {
        const nodes = this._datasource.vertices;
        const edges = this._datasource.edges;
        if (selectedGroups.length === 0) {
            return {
                filteredNodes: [],
                filteredEdges: []
            };
        }

        const nodeMap = new Map<string, Vertex>();
        nodes.forEach(node => nodeMap.set(node.id, node));

        const adjacencyList = new Map<string, Set<string>>();
        nodes.forEach(node => adjacencyList.set(node.id, new Set()));
        edges.forEach(edge => {
            adjacencyList.get(edge.from)?.add(edge.to);
            adjacencyList.get(edge.to)?.add(edge.from);
        });

        const selectedGroupNodeIds = new Set<string>();
        nodes.forEach(node => {
            if (selectedGroups.includes(node.group as string)) {
                selectedGroupNodeIds.add(node.id);
            }
        });

        const nodesToKeep = new Set<string>();
        const edgesToKeep = new Set<string>();

        selectedGroupNodeIds.forEach(nodeId => {
            nodesToKeep.add(nodeId);
            const neighbors = adjacencyList.get(nodeId) || new Set();
            neighbors.forEach(neighborId => {
                nodesToKeep.add(neighborId);
            const edgeKey = this.edgeKey(nodeId, neighborId);
                edgesToKeep.add(edgeKey);
            });
        });

        const starNodesInKeep = Array.from(nodesToKeep).filter(id => {
            const node = nodeMap.get(id);
            return node?.shape === 'star';
        });

        starNodesInKeep.forEach(starId => {
            const neighbors = adjacencyList.get(starId) || new Set();

            neighbors.forEach(neighborId => {
                const neighborNode = nodeMap.get(neighborId);
                if (neighborNode?.shape === 'dot' || neighborNode?.shape === 'hexagon') {
                    nodesToKeep.add(neighborId);
                    const edgeKey = this.edgeKey(starId, neighborId);
                    edgesToKeep.add(edgeKey);
                }
            });
        });

        selectedGroupNodeIds.forEach(nodeId1 => {
            selectedGroupNodeIds.forEach(nodeId2 => {
                if (nodeId1 < nodeId2) {
                    const edgeKey = this.edgeKey(nodeId1, nodeId2);
                    if (adjacencyList.get(nodeId1)?.has(nodeId2)) {
                        edgesToKeep.add(edgeKey);
                    }
                }
            });
        });

        const filteredNodes: Vertex[] = nodes.filter(node => nodesToKeep.has(node.id));
        const filteredEdges: Edge[] = [];
        const addedEdges = new Set<string>();

        edges.forEach(edge => {
                const edgeKey = this.edgeKey(edge.from, edge.to);

            if (edgesToKeep.has(edgeKey) && !addedEdges.has(edgeKey)) {
                const newEdge = {...edge};
                filteredEdges.push(newEdge);
                addedEdges.add(edgeKey);
            }
        });

        return {
            filteredNodes,
            filteredEdges,
        };
    }

    filterGraphByTransitNum(transitsNumber: number): { filteredNodes: Vertex[], filteredEdges: Edge[] } {
        let groups = new Set<string>()
        if (transitsNumber <= 0) {
            return {filteredNodes: this._datasource.vertices, filteredEdges: this._datasource.edges}
        }

        const transitsWithWeight = dealTransitWeight(this._datasource.vertices)
        for (const transit of transitsWithWeight) {
            if (groups.size >= transitsNumber) {
                break
            }
            groups.add(transit.group as string)
        }

        return this.filterGraphByTransit([...groups])
    }

    render(vertices: Vertex[], edges: Edge[]) {
        this._edges = new DataSet(edges);
        this._nodes = new DataSet(vertices);
        if (!this._graph) {
            this.createVisGraph()
        } else {
            this._graph?.setData({
                nodes: this._nodes,
                edges: this._edges
            });
            this._graph.on('stabilizationProgress', (params) => {
                const percent = Math.round((params.iterations / params.total) * 100)
                this.allLoadingInstance?.setText(`${percent}%`)
            })
            this._graph.once('stabilizationIterationsDone', () => {
                this.allLoadingInstance?.close()
            })
        }
    }
}
