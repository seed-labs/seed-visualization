import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createGlobeGraph, type GlobeGraph, type GlobeNode } from '@/view/map/uploadMap/services/globeGraph'
import { filterGraphByIXRoutersData } from '@/view/map/uploadMap/ui'
import { DataSource } from '@/view/map/ixMap/datasource'
import type { Edge } from '@/utils/map-datasource'

type GeoPoint = {
  lat: number
  lon: number
}

const AS_NODE_RADIUS = 0.92
const TRANSIT_ROUTER_NAME_PATTERN = /^r\d+$/

function normalizeLongitude(longitude: number) {
  return ((longitude + 540) % 360) - 180
}

function makeOffsetPoint(origin: GeoPoint, angle: number, radius = AS_NODE_RADIUS): GeoPoint {
  const lat = Math.max(-85, Math.min(85, origin.lat + Math.sin(angle) * radius))
  const lonScale = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.18)
  const lon = origin.lon + (Math.cos(angle) * radius) / lonScale
  return { lat, lon: normalizeLongitude(lon) }
}

function edgeKey(from: string, to: string) {
  return from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`
}

function isTransitRouter(vertex?: { object?: any }) {
  const emulatorInfo = vertex?.object?.meta?.emulatorInfo
  return ['Router', 'BorderRouter'].includes(emulatorInfo?.role)
    && TRANSIT_ROUTER_NAME_PATTERN.test(emulatorInfo?.name ?? '')
}

export function useIxMap3DUi() {
  const datasource = new DataSource()
  const nodeScale = ref(2)
  const showRouterNodes = ref(true)
  const settingsOpen = ref(false)
  const loadingVisible = ref(true)
  const graph = ref<GlobeGraph>({ nodes: [], edges: [] })
  const ixOptions = ref<{ label: string; value: string }[]>([])
  const selectedIxLabels = ref<string[]>([])
  const ixCount = ref(0)
  const orientToInitialNode = ref(true)
  const waitingForGraphRender = ref(false)
  const selectedAsn = ref<string>()
  const selectedAsSourceId = ref<string>()

  const ixCountMax = computed(() => ixOptions.value.length)

  function waitForBrowserPaint() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 0))
    })
  }

  function setIxOptions() {
    ixOptions.value = datasource.ixs
      .map((ix) => ({
        label: ix.meta?.emulatorInfo?.displayname || ix.meta?.emulatorInfo?.name,
        value: ix.meta?.emulatorInfo?.name,
      }))
      .filter((item): item is { label: string; value: string } => Boolean(item.label && item.value))

    selectedIxLabels.value = ixOptions.value.map((item) => item.value)
    ixCount.value = ixOptions.value.length
  }

  function buildAdjacency(edges: Edge[]) {
    const adjacency = new Map<string, Edge[]>()
    edges.forEach((edge) => {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
      if (!adjacency.has(edge.to)) adjacency.set(edge.to, [])
      adjacency.get(edge.from)?.push(edge)
      adjacency.get(edge.to)?.push(edge)
    })
    return adjacency
  }

  function getOtherEnd(edge: Edge, nodeId: string) {
    return edge.from === nodeId ? edge.to : edge.from
  }

  function buildSimplifiedAsEdges(asNodeIds: Set<string>, originalEdges: Edge[]) {
    const adjacency = buildAdjacency(originalEdges)
    const simplifiedEdges: { fromSourceId: string; toSourceId: string; label?: string }[] = []
    const added = new Set<string>()

    asNodeIds.forEach((startId) => {
      const queue: { nodeId: string; labels: string[] }[] = [{ nodeId: startId, labels: [] }]
      const visited = new Set<string>([startId])

      while (queue.length > 0) {
        const current = queue.shift()!
        for (const edge of adjacency.get(current.nodeId) ?? []) {
          const nextId = getOtherEnd(edge, current.nodeId)
          if (visited.has(nextId)) continue

          const labels = edge.label ? [...current.labels, edge.label] : current.labels
          if (asNodeIds.has(nextId)) {
            if (nextId !== startId) {
              const key = edgeKey(startId, nextId)
              if (!added.has(key)) {
                simplifiedEdges.push({
                  fromSourceId: startId,
                  toSourceId: nextId,
                  label: labels.filter(Boolean).join('/'),
                })
                added.add(key)
              }
            }
            continue
          }

          visited.add(nextId)
          queue.push({ nodeId: nextId, labels })
        }
      }
    })

    return simplifiedEdges
  }

  function augmentAsHighlight(baseGraph: GlobeGraph, asn: string, sourceId?: string): GlobeGraph {
    const vertices = datasource.vertices
    const sourceNodeById = new Map(baseGraph.nodes.filter((node) => node.sourceId).map((node) => [node.sourceId!, node]))
    const nodeById = new Map(baseGraph.nodes.map((node) => [node.id, { ...node }]))
    const asVertices = vertices.filter((vertex) => isTransitRouter(vertex) && String(vertex.group ?? '') === asn)
    const asNodeIds = new Set(asVertices.map((vertex) => vertex.id))
    const anchor = sourceNodeById.get(sourceId ?? '')
      ?? baseGraph.nodes.find((node) => node.sourceId && asNodeIds.has(node.sourceId))
      ?? baseGraph.nodes.find((node) => node.kind === 'star')
      ?? baseGraph.nodes[0]
    const origin = anchor ? { lat: anchor.lat, lon: anchor.lon } : { lat: 0, lon: 0 }

    asVertices.forEach((vertex, index) => {
      const existing = sourceNodeById.get(vertex.id)
      if (existing) {
        nodeById.set(existing.id, { ...existing, highlighted: true })
        return
      }

      const point = makeOffsetPoint(origin, (Math.PI * 2 * index) / Math.max(asVertices.length, 1))
      nodeById.set(`as::${vertex.id}`, {
        id: `as::${vertex.id}`,
        label: vertex.label,
        lat: point.lat,
        lon: point.lon,
        height: 150000,
        kind: vertex.shape === 'hexagon' ? 'node' : 'dot',
        parentId: anchor?.id,
        sourceId: vertex.id,
        group: vertex.group,
        highlighted: true,
      })
    })

    const sourceToNodeId = new Map<string, string>()
    Array.from(nodeById.values()).forEach((node) => {
      if (node.sourceId) sourceToNodeId.set(node.sourceId, node.id)
    })

    const highlightedEdges = buildSimplifiedAsEdges(asNodeIds, datasource.edges)
      .map((edge) => ({
        from: sourceToNodeId.get(edge.fromSourceId),
        to: sourceToNodeId.get(edge.toSourceId),
        label: edge.label,
      }))
      .filter((edge): edge is { from: string; to: string; label: string | undefined } => Boolean(edge.from && edge.to))

    const edges = [...baseGraph.edges]
    const addedEdges = new Set(edges.map((edge) => edgeKey(edge.from, edge.to)))
    highlightedEdges.forEach((edge) => {
      const key = edgeKey(edge.from, edge.to)
      if (addedEdges.has(key)) return
      edges.push({ ...edge, surfaceCurve: true })
      addedEdges.add(key)
    })

    return {
      nodes: Array.from(nodeById.values()),
      edges,
    }
  }

  function renderSelectedIX() {
    const { filteredNodes, filteredEdges } = filterGraphByIXRoutersData(
      datasource.vertices,
      datasource.edges,
      selectedIxLabels.value,
    )
    const baseGraph = createGlobeGraph(filteredNodes, filteredEdges)
    graph.value = selectedAsn.value
      ? augmentAsHighlight(baseGraph, selectedAsn.value, selectedAsSourceId.value)
      : baseGraph
  }

  async function renderWithLoading(orientToGraph = true) {
    loadingVisible.value = true
    await nextTick()
    await waitForBrowserPaint()

    try {
      orientToInitialNode.value = orientToGraph
      waitingForGraphRender.value = true
      renderSelectedIX()
      if (graph.value.nodes.length === 0) {
        ElMessage.warning('No IX nodes were found.')
      }
    } catch (error) {
      console.error('IXMap3D graph calculation failed:', error)
      ElMessage.error('IXMap3D graph calculation failed.')
      waitingForGraphRender.value = false
      loadingVisible.value = false
    }
  }

  async function loadMap() {
    loadingVisible.value = true
    orientToInitialNode.value = true
    waitingForGraphRender.value = false
    graph.value = { nodes: [], edges: [] }
    selectedIxLabels.value = []
    ixCount.value = 0
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined

    try {
      await datasource.connect()
      setIxOptions()
      await renderWithLoading()
    } catch (error) {
      console.error('IXMap3D loading failed:', error)
      ElMessage.error('IXMap3D loading failed.')
      loadingVisible.value = false
    }
  }

  function applyIxCount(value: number | undefined) {
    const count = Math.max(0, Math.min(value ?? 0, ixOptions.value.length))
    selectedIxLabels.value = ixOptions.value.slice(0, count).map((item) => item.value)
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined
  }

  function applyIxSelection() {
    ixCount.value = selectedIxLabels.value.length
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined
  }

  async function onGlobeNodeClick(node: GlobeNode) {
    if (node.kind !== 'dot' || !node.sourceId) {
      ElMessage.warning('Please select an AS router node.')
      return
    }

    const vertex = datasource.vertices.find((item) => item.id === node.sourceId)
    if (!isTransitRouter(vertex)) {
      ElMessage.warning('Please select an AS router node.')
      return
    }

    const asn = vertex?.group
    if (!asn) {
      ElMessage.warning('Please select an AS router node.')
      return
    }

    if (selectedAsn.value === String(asn)) {
      selectedAsn.value = undefined
      selectedAsSourceId.value = undefined
    } else {
      selectedAsn.value = String(asn)
      selectedAsSourceId.value = node.sourceId
    }
    await renderWithLoading(false)
  }

  function onGlobeRendered(renderedGraph: GlobeGraph) {
    if (!waitingForGraphRender.value) return
    if (renderedGraph !== graph.value) return

    waitingForGraphRender.value = false
    loadingVisible.value = false
    if (orientToInitialNode.value && graph.value.nodes.length > 0) {
      orientToInitialNode.value = false
    }
  }

  onMounted(() => {
    loadMap()
  })

  onBeforeUnmount(() => {
    try {
      datasource.disconnect()
    } catch {
      // The datasource may fail before sockets are opened.
    }
  })

  return {
    nodeScale,
    showRouterNodes,
    settingsOpen,
    loadingVisible,
    graph,
    ixOptions,
    selectedIxLabels,
    ixCount,
    orientToInitialNode,
    ixCountMax,
    loadMap,
    renderWithLoading,
    applyIxCount,
    applyIxSelection,
    onGlobeRendered,
    onGlobeNodeClick,
  }
}
