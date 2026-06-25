import type { Edge, Vertex } from '@/utils/map-datasource'
import type { GlobeGraph } from '@/view/map/uploadMap/services/globeGraph'

type GeoPoint = {
  lat: number
  lon: number
}

const AS_NODE_RADIUS = 0.92
export function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0))
  })
}

export function edgeKey(from: string, to: string) {
  return from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`
}

function normalizeLongitude(longitude: number) {
  return ((longitude + 540) % 360) - 180
}

function makeOffsetPoint(origin: GeoPoint, angle: number, radius = AS_NODE_RADIUS): GeoPoint {
  const lat = Math.max(-85, Math.min(85, origin.lat + Math.sin(angle) * radius))
  const lonScale = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.18)
  const lon = origin.lon + (Math.cos(angle) * radius) / lonScale
  return { lat, lon: normalizeLongitude(lon) }
}

export function isTransitRouter(vertex?: { object?: any }) {
  const emulatorInfo = vertex?.object?.meta?.emulatorInfo
  return ['Router', 'BorderRouter'].includes(emulatorInfo?.role)
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

export function augmentAsHighlight(
  baseGraph: GlobeGraph,
  vertices: Vertex[],
  edges: Edge[],
  asn: string,
  _sourceId?: string,
): GlobeGraph {
  const sourceNodesById = new Map<string, typeof baseGraph.nodes>()
  const nodeById = new Map(baseGraph.nodes.map((node) => [node.id, { ...node }]))
  const visibleStarIds = new Set(
    baseGraph.nodes
      .filter((node) => node.kind === 'star')
      .map((node) => node.sourceId ?? node.id),
  )
  const starIds = new Set(vertices.filter((vertex) => vertex.shape === 'star').map((vertex) => vertex.id))
  const visibleStarIdsByRouterId = new Map<string, string[]>()

  baseGraph.nodes.forEach((node) => {
    if (!node.sourceId) return
    const nodes = sourceNodesById.get(node.sourceId) ?? []
    nodes.push(node)
    sourceNodesById.set(node.sourceId, nodes)
  })

  edges.forEach((edge) => {
    const fromIsVisibleStar = starIds.has(edge.from) && visibleStarIds.has(edge.from)
    const toIsVisibleStar = starIds.has(edge.to) && visibleStarIds.has(edge.to)
    const routerId = fromIsVisibleStar ? edge.to : toIsVisibleStar ? edge.from : undefined
    const starId = fromIsVisibleStar ? edge.from : toIsVisibleStar ? edge.to : undefined
    if (!routerId || !starId) return

    const ids = visibleStarIdsByRouterId.get(routerId) ?? []
    ids.push(starId)
    visibleStarIdsByRouterId.set(routerId, ids)
  })

  const asVertices = vertices
    .filter((vertex) => isTransitRouter(vertex) && String(vertex.group ?? '') === asn)
    .filter((vertex) => sourceNodesById.has(vertex.id) || visibleStarIdsByRouterId.has(vertex.id))
  const asNodeIds = new Set(asVertices.map((vertex) => vertex.id))

  asVertices.forEach((vertex, index) => {
    const existingNodes = sourceNodesById.get(vertex.id)
    if (existingNodes?.length) {
      existingNodes.forEach((existing) => {
        nodeById.set(existing.id, { ...existing, highlighted: true })
      })
      return
    }

    const visibleStarId = visibleStarIdsByRouterId.get(vertex.id)?.[0]
    const visibleStarNode = baseGraph.nodes.find((node) => (node.sourceId ?? node.id) === visibleStarId)
    if (!visibleStarNode) return

    const pointOrigin = { lat: visibleStarNode.lat, lon: visibleStarNode.lon }
    const point = makeOffsetPoint(pointOrigin, (Math.PI * 2 * index) / Math.max(asVertices.length, 1))
    nodeById.set(`as::${visibleStarNode.id}::${vertex.id}`, {
      id: `as::${visibleStarNode.id}::${vertex.id}`,
      label: vertex.label,
      lat: point.lat,
      lon: point.lon,
      height: 150000,
      kind: vertex.shape === 'hexagon' ? 'node' : 'dot',
      parentId: visibleStarNode.id,
      isIxRouter: false,
      sourceId: vertex.id,
      group: vertex.group,
      highlighted: true,
    })
  })

  const sourceToNodeId = new Map<string, string>()
  Array.from(nodeById.values()).forEach((node) => {
    if (node.sourceId) sourceToNodeId.set(node.sourceId, node.id)
  })

  const highlightedEdges = buildSimplifiedAsEdges(asNodeIds, edges)
    .map((edge) => ({
      from: sourceToNodeId.get(edge.fromSourceId),
      to: sourceToNodeId.get(edge.toSourceId),
      label: edge.label,
    }))
    .filter((edge): edge is { from: string; to: string; label: string | undefined } => Boolean(edge.from && edge.to))

  const renderEdges = [...baseGraph.edges]
  const addedEdges = new Set(renderEdges.map((edge) => edgeKey(edge.from, edge.to)))
  highlightedEdges.forEach((edge) => {
    const key = edgeKey(edge.from, edge.to)
    if (addedEdges.has(key)) return
    renderEdges.push({ ...edge, surfaceCurve: true })
    addedEdges.add(key)
  })

  return {
    nodes: Array.from(nodeById.values()),
    edges: renderEdges,
  }
}
