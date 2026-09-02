import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'
import {
  createEmulatorTopologyGraph,
  type EmulatorTopologyStats,
  type EmulatorTopologyVisibleTypes,
} from '@/view/map/shared/services/emulatorTopologyGraph'
import type { GlobeGraph, GlobeNode } from '@/view/map/shared/services/globeGraph'
import { waitForBrowserPaint } from '@/view/map/shared/services/map3dGraph'
import { filterGraphEdgesByPath } from '@/view/map/shared/services/packetPathGraphFilter'
import {
  buildTopologySearchSuggestions,
  findTopologySearchNodeIds,
  type TopologySearchSuggestion,
} from '@/view/map/shared/services/topologySearch'

type PathFilterNodes = string[] | string[][]

export type EmulatorTopologyGraphControllerOptions = {
  getPathFilterEnabled?: () => boolean
  getPathFilterNodes?: () => PathFilterNodes
  orientToNode?: (nodeId: string) => void
}

const emptyStats: EmulatorTopologyStats = {
  autonomousSystems: 0,
  ix: 0,
  networks: 0,
  routers: 0,
  hosts: 0,
  renderedNodes: 0,
  renderedLinks: 0,
}

function isTransitRouter(node: EmulatorNode) {
  const info = node.meta?.emulatorInfo
  const name = String(info?.name ?? '')
  return ['Router', 'BorderRouter', 'Route Server'].includes(info?.role ?? '') && /^r\d+$/i.test(name)
}

function createAsSummary(nodes: EmulatorNode[]) {
  const counts = new Map<string, { asn: string; routers: number; hosts: number }>()
  nodes.forEach((node) => {
    const info = node.meta?.emulatorInfo
    const asn = String(info?.asn ?? '')
    if (!asn || !isTransitRouter(node)) return
    const summary = counts.get(asn) ?? { asn, routers: 0, hosts: 0 }
    summary.routers += 1
    counts.set(asn, summary)
  })
  return Array.from(counts.values()).sort((left, right) => Number(left.asn) - Number(right.asn))
}

function createAsDetails(nodes: EmulatorNode[]) {
  const details = new Map<string, Array<{ name: string; role: string; nets: string }>>()
  nodes.forEach((node) => {
    const info = node.meta?.emulatorInfo
    const asn = String(info?.asn ?? '')
    if (!asn || !isTransitRouter(node)) return
    const rows = details.get(asn) ?? []
    rows.push({
      name: String(info?.name ?? ''),
      role: info?.role ?? '',
      nets: (info?.nets ?? []).map((net) => `${net.name}: ${net.address}`).join(', '),
    })
    details.set(asn, rows)
  })
  return details
}

function createIxSummary(networks: EmulatorNetwork[]) {
  return networks
    .filter((network) => network.meta?.emulatorInfo?.type === 'global')
    .map((network) => ({
      name: network.meta?.emulatorInfo?.name ?? network.Name ?? network.Id,
      label: network.meta?.emulatorInfo?.displayname
        || network.meta?.emulatorInfo?.name
        || network.Name
        || network.Id.slice(0, 12),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))
}

export function useEmulatorTopologyGraph(options: EmulatorTopologyGraphControllerOptions = {}) {
  const graph = ref<GlobeGraph>({ nodes: [], edges: [] })
  const baseGraph = ref<GlobeGraph>({ nodes: [], edges: [] })
  const containers = ref<EmulatorNode[]>([])
  const networks = ref<EmulatorNetwork[]>([])
  const loadingVisible = ref(false)
  const waitingForGraphRender = ref(false)
  const orientToInitialNode = ref(true)
  const nodeScale = ref(2)
  const showNodeLabels = ref(true)
  const showHoverDetails = ref(true)
  const hoveredNode = ref<GlobeNode>()
  const hoverPosition = ref({ x: 0, y: 0 })
  const keyword = ref('')
  const searchHighlightedNodeIds = ref<Set<string>>(new Set())
  const selectedAsns = ref<Set<string>>(new Set())
  const selectedIxNames = ref<Set<string>>(new Set())
  const showAsDetails = ref(true)
  const expandedParentIds = ref<string[]>([])
  const selectedNode = ref<GlobeNode>()
  const stats = ref<EmulatorTopologyStats>({ ...emptyStats })
  const visibleTypes = ref<EmulatorTopologyVisibleTypes>({
    ix: true,
    network: true,
    router: true,
    host: true,
  })

  let renderGeneration = 0
  let pendingRenderedGraph: GlobeGraph | undefined

  const selectedAsnValues = computed({
    get: () => Array.from(selectedAsns.value),
    set: (value: string[]) => {
      selectedAsns.value = new Set(value.map(String))
      renderGraph(false)
    },
  })

  const selectedIxNameValues = computed({
    get: () => Array.from(selectedIxNames.value),
    set: (value: string[]) => {
      selectedIxNames.value = new Set(value.map(String))
      renderGraph(false)
    },
  })

  const selectedNodeSummary = computed(() => {
    if (!selectedNode.value) return undefined
    return {
      id: selectedNode.value.sourceId ?? selectedNode.value.id,
      label: selectedNode.value.label,
      group: selectedNode.value.group || '-',
      type: selectedNode.value.kind,
      position: `${selectedNode.value.lat.toFixed(4)}, ${selectedNode.value.lon.toFixed(4)}`,
    }
  })

  const ixSummaries = computed(() => createIxSummary(networks.value))
  const asSummaries = computed(() => createAsSummary(containers.value))
  const asDetailsByAsn = computed(() => createAsDetails(containers.value))

  function resetTopologyState() {
    containers.value = []
    networks.value = []
    baseGraph.value = { nodes: [], edges: [] }
    graph.value = { nodes: [], edges: [] }
    stats.value = { ...emptyStats }
    selectedNode.value = undefined
    searchHighlightedNodeIds.value = new Set()
    selectedAsns.value = new Set()
    selectedIxNames.value = new Set()
    keyword.value = ''
    loadingVisible.value = false
    waitingForGraphRender.value = false
    pendingRenderedGraph = undefined
  }

  function resetTopologyFilters() {
    selectedNode.value = undefined
    searchHighlightedNodeIds.value = new Set()
    selectedAsns.value = new Set()
    selectedIxNames.value = new Set()
    keyword.value = ''
  }

  async function setTopologyData(value: { nodes: EmulatorNode[]; nets: EmulatorNetwork[] }, orientToGraph = true) {
    containers.value = value.nodes ?? []
    networks.value = value.nets ?? []
    resetTopologyFilters()
    await renderGraph(orientToGraph)
  }

  async function renderGraph(orientToGraph = true) {
    const generation = ++renderGeneration
    loadingVisible.value = true
    waitingForGraphRender.value = true
    pendingRenderedGraph = undefined
    orientToInitialNode.value = orientToGraph
    await nextTick()
    await waitForBrowserPaint()
    if (generation !== renderGeneration) return

    const result = createEmulatorTopologyGraph(containers.value, networks.value, {
      visibleTypes: visibleTypes.value,
      keyword: '',
      selectedAsns: Array.from(selectedAsns.value),
      selectedIxNames: Array.from(selectedIxNames.value),
    })
    baseGraph.value = result.graph
    const nextGraph = createDisplayGraph(result.graph)

    pendingRenderedGraph = nextGraph
    graph.value = nextGraph
    stats.value = {
      ...result.stats,
      renderedLinks: nextGraph.edges.length,
    }
    expandedParentIds.value = result.expandedParentIds

    if (graph.value.nodes.length === 0) {
      ElMessage.warning('No nodes matched the current view.')
    }
  }

  function createDisplayGraph(source: GlobeGraph): GlobeGraph {
    const selectedId = selectedNode.value?.id
    const highlightedIds = searchHighlightedNodeIds.value
    const highlightedGraph = {
      nodes: source.nodes.map((node) => ({
        ...node,
        searchHighlighted: highlightedIds.has(node.id),
        highlighted:
          node.highlighted
          || highlightedIds.has(node.id)
          || node.id === selectedId
          || node.sourceId === selectedId,
      })),
      edges: source.edges,
    }
    return filterGraphEdgesByPath(
      highlightedGraph,
      options.getPathFilterNodes?.() ?? [],
      Boolean(options.getPathFilterEnabled?.()),
    )
  }

  function refreshDisplayGraph() {
    const nextGraph = createDisplayGraph(baseGraph.value)
    graph.value = nextGraph
    stats.value = {
      ...stats.value,
      renderedLinks: nextGraph.edges.length,
    }
  }

  function applySearch() {
    const query = keyword.value.trim()
    selectedNode.value = undefined
    searchHighlightedNodeIds.value = findTopologySearchNodeIds(baseGraph.value.nodes, query)
    if (query && searchHighlightedNodeIds.value.size === 0) {
      ElMessage.warning('No matching node found in the current visible topology.')
    }
    refreshDisplayGraph()
    if (searchHighlightedNodeIds.value.size === 1) {
      orientSearchResultToFront(Array.from(searchHighlightedNodeIds.value)[0]!)
    }
  }

  function submitSearchFromKeyboard(event: KeyboardEvent) {
    applySearch()
    ;(event.target as HTMLElement | null)?.blur()
  }

  function clearSearch() {
    keyword.value = ''
    searchHighlightedNodeIds.value = new Set()
    selectedNode.value = undefined
    refreshDisplayGraph()
  }

  function querySearchSuggestions(query: string, callback: (suggestions: TopologySearchSuggestion[]) => void) {
    callback(buildTopologySearchSuggestions(baseGraph.value.nodes, query))
  }

  function selectSearchSuggestion(suggestion: TopologySearchSuggestion) {
    keyword.value = suggestion.value
    applySearch()
  }

  async function onNodeClick(node: GlobeNode) {
    selectedNode.value = node
    refreshDisplayGraph()
  }

  function onNodeHover(node: GlobeNode | undefined, position: { x: number; y: number }) {
    if (!showHoverDetails.value || !node) {
      hoveredNode.value = undefined
      return
    }
    hoveredNode.value = node
    hoverPosition.value = position
  }

  function onGlobeRendered(renderedGraph: GlobeGraph) {
    if (!waitingForGraphRender.value || !pendingRenderedGraph) return
    waitingForGraphRender.value = false
    pendingRenderedGraph = undefined
    if (orientToInitialNode.value && renderedGraph.nodes.length > 0) {
      orientToInitialNode.value = false
    }
    loadingVisible.value = false
  }

  function orientSearchResultToFront(nodeId: string) {
    const matchedNode = graph.value.nodes.find((node) => node.id === nodeId || node.sourceId === nodeId)
    if (!matchedNode) return
    nextTick(() => options.orientToNode?.(matchedNode.id))
  }

  function clearTopologyFilters() {
    selectedAsns.value = new Set()
    selectedIxNames.value = new Set()
    renderGraph(false)
  }

  return {
    graph,
    baseGraph,
    containers,
    networks,
    loadingVisible,
    waitingForGraphRender,
    orientToInitialNode,
    nodeScale,
    showNodeLabels,
    showHoverDetails,
    hoveredNode,
    hoverPosition,
    keyword,
    searchHighlightedNodeIds,
    selectedAsns,
    selectedIxNames,
    selectedAsnValues,
    selectedIxNameValues,
    showAsDetails,
    expandedParentIds,
    selectedNode,
    stats,
    visibleTypes,
    selectedNodeSummary,
    ixSummaries,
    asSummaries,
    asDetailsByAsn,
    resetTopologyState,
    resetTopologyFilters,
    setTopologyData,
    renderGraph,
    createDisplayGraph,
    refreshDisplayGraph,
    applySearch,
    submitSearchFromKeyboard,
    clearSearch,
    querySearchSuggestions,
    selectSearchSuggestion,
    onNodeClick,
    onNodeHover,
    onGlobeRendered,
    orientSearchResultToFront,
    clearTopologyFilters,
  }
}
