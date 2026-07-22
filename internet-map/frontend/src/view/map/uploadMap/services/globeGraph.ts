import type { Edge, Vertex } from '@/utils/map-datasource'
import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'

export type GlobeNodeKind = 'star' | 'dot' | 'node'

export type GlobeNode = {
  id: string
  label: string
  lat: number
  lon: number
  height: number
  kind: GlobeNodeKind
  parentId?: string
  hasExplicitGeo?: boolean
  isIxRouter?: boolean
  sourceId?: string
  group?: string
  highlighted?: boolean
}

export type GlobeEdge = {
  from: string
  to: string
  label?: string
  surfaceCurve?: boolean
  keepLineColor?: boolean
  internalRouterLink?: boolean
}

export type GlobeGraph = {
  nodes: GlobeNode[]
  edges: GlobeEdge[]
}

type GeoPoint = {
  lat: number
  lon: number
}

const FALLBACK_MIN_STAR_DISTANCE = 18
const FALLBACK_RANDOM_ATTEMPTS_MAX = 320
const FALLBACK_RANDOM_ATTEMPTS_MIN = 72
const ROUTER_SURFACE_CURVE_MIN_DISTANCE = 0.35
const INTERNAL_ROUTER_AUTO_RADIUS = 0.95

function normalizeGeoPoint(lat: number, lon: number): GeoPoint | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined
  if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }
  if (Math.abs(lon) <= 90 && Math.abs(lat) <= 180) return { lat: lon, lon: lat }
  return undefined
}

function tryParseGeoPoint(value: unknown): GeoPoint | undefined {
  if (!value) return undefined

  if (typeof value === 'string') {
    try {
      return tryParseGeoPoint(JSON.parse(value))
    } catch {
      const pair = value.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/)
      return pair ? normalizeGeoPoint(Number(pair[1]), Number(pair[2])) : undefined
    }
  }

  if (typeof value !== 'object') return undefined
  const objectValue = value as Record<string, unknown>
  const lat = objectValue.latitude ?? objectValue.lat ?? objectValue.Latitude ?? objectValue.LAT
  const lon = objectValue.longitude ?? objectValue.lon ?? objectValue.lng ?? objectValue.Longitude ?? objectValue.LON ?? objectValue.LNG
  if (lat !== undefined && lon !== undefined && lat !== "" && lon !== "") {
    const point = normalizeGeoPoint(Number(lat), Number(lon))
    if (point) return point
  }

  for (const key of ['location', 'geo', 'coord', 'coords', 'coordinate', 'coordinates', 'position']) {
    const point = tryParseGeoPoint(objectValue[key])
    if (point) return point
  }

  return undefined
}

function getVertexGeo(vertex: Vertex): GeoPoint | undefined {
  if (vertex.type === 'node') {
    const node = vertex.object as EmulatorNode
    return tryParseGeoPoint(node.meta?.emulatorInfo) ?? tryParseGeoPoint(node.meta) ?? tryParseGeoPoint(node)
  }

  const network = vertex.object as EmulatorNetwork
  return tryParseGeoPoint(network.meta?.emulatorInfo) ?? tryParseGeoPoint(network.meta) ?? tryParseGeoPoint(network)
}

function normalizeLongitude(longitude: number) {
  return ((longitude + 540) % 360) - 180
}

function makeOffsetPoint(origin: GeoPoint, angle: number, radius = 0.72): GeoPoint {
  const lat = Math.max(-85, Math.min(85, origin.lat + Math.sin(angle) * radius))
  const lonScale = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.18)
  const lon = origin.lon + (Math.cos(angle) * radius) / lonScale
  return { lat, lon: normalizeLongitude(lon) }
}

function pointDistance(a: GeoPoint, b: GeoPoint) {
  const latScale = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const lonDelta = normalizeLongitude(a.lon - b.lon) * Math.max(latScale, 0.18)
  return Math.hypot(lonDelta, a.lat - b.lat)
}

function getFallbackRandomAttempts(placedPointCount: number) {
  if (placedPointCount < 80) return FALLBACK_RANDOM_ATTEMPTS_MAX
  if (placedPointCount < 240) return 180
  return FALLBACK_RANDOM_ATTEMPTS_MIN
}

function createFallbackStarCandidates(placedPointCount: number) {
  const candidates: GeoPoint[] = []
  const attempts = getFallbackRandomAttempts(placedPointCount)

  for (let index = 0; index < attempts; index += 1) {
    candidates.push({
      lat: -70 + Math.random() * 140,
      lon: -180 + Math.random() * 360,
    })
  }

  return candidates
}

function chooseFallbackStarPoint(placedPoints: GeoPoint[]): GeoPoint {
  const candidates = createFallbackStarCandidates(placedPoints.length)
  if (candidates.length === 0) {
    return {
      lat: -70 + Math.random() * 140,
      lon: -180 + Math.random() * 360,
    }
  }

  let bestPoint = candidates[0]!
  let bestScore = -Infinity
  const scoredCandidates = candidates.map((candidate) => {
    let nearestDistance = 180
    for (const point of placedPoints) {
      nearestDistance = Math.min(nearestDistance, pointDistance(candidate, point))
    }
    return { candidate, nearestDistance }
  })
  const viableCandidates = scoredCandidates.filter(({ nearestDistance }) => nearestDistance >= FALLBACK_MIN_STAR_DISTANCE)
  const candidatesToScore = viableCandidates.length > 0 ? viableCandidates : scoredCandidates

  candidatesToScore.forEach(({ candidate, nearestDistance }) => {
    const tooClosePenalty = nearestDistance < FALLBACK_MIN_STAR_DISTANCE
      ? (FALLBACK_MIN_STAR_DISTANCE - nearestDistance) * 1_000
      : 0
    const latitudePenalty = Math.max(0, Math.abs(candidate.lat) - 58) * 0.35
    const score = nearestDistance - tooClosePenalty - latitudePenalty

    if (score > bestScore) {
      bestScore = score
      bestPoint = candidate
    }
  })

  return bestPoint
}

function getEdgeKey(from: string, to: string) {
  return from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`
}

function buildEdgeLabelByPair(edges: Edge[]) {
  const edgeLabelByPair = new Map<string, string | undefined>()
  edges.forEach((edge) => {
    const key = getEdgeKey(edge.from, edge.to)
    if (!edgeLabelByPair.has(key)) {
      edgeLabelByPair.set(key, edge.label)
    }
  })
  return edgeLabelByPair
}

function isRouterVertex(vertex?: Vertex) {
  if (vertex?.type !== 'node') return false
  const role = (vertex.object as any)?.meta?.emulatorInfo?.role
  return vertex?.shape === 'dot' && ['Router', 'BorderRouter'].includes(role)
}

function isLocalNetworkVertex(vertex?: Vertex) {
  return vertex?.shape === 'diamond'
}

function getOtherEdgeEnd(edge: Edge, id: string) {
  return edge.from === id ? edge.to : edge.from
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

export function createGlobeGraph(vertices: Vertex[], edges: Edge[]): GlobeGraph {
  const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]))
  const edgeLabelByPair = buildEdgeLabelByPair(edges)
  const adjacency = buildAdjacency(edges)
  const starVertices = vertices.filter((vertex) => vertex.shape === 'star')
  const starIds = new Set(starVertices.map((vertex) => vertex.id))
  const routerVertices = vertices.filter(isRouterVertex)
  const directRouteVerticesByStarId = new Map<string, Vertex[]>()
  const directStarIdsByRouterId = new Map<string, string[]>()
  const starPositions = new Map<string, GeoPoint>()
  const routerPositions = new Map<string, GeoPoint>()
  const sourceNodeIdsByRouterId = new Map<string, string[]>()
  const autoPlacedRouterCountByAnchor = new Map<string, number>()
  const nodes: GlobeNode[] = []
  const globeEdges: GlobeEdge[] = []
  const knownStarPoints: GeoPoint[] = []
  const missingStarVertices: Vertex[] = []

  starVertices.forEach((vertex) => {
    const point = getVertexGeo(vertex)
    if (!point) {
      missingStarVertices.push(vertex)
      return
    }

    starPositions.set(vertex.id, point)
    knownStarPoints.push(point)
  })

  const placedStarPoints = [...knownStarPoints]
  missingStarVertices.forEach((vertex) => {
    const point = chooseFallbackStarPoint(placedStarPoints)
    starPositions.set(vertex.id, point)
    placedStarPoints.push(point)
  })

  edges.forEach((edge) => {
    const fromIsStar = starIds.has(edge.from)
    const toIsStar = starIds.has(edge.to)
    const routeVertex = fromIsStar ? vertexById.get(edge.to) : toIsStar ? vertexById.get(edge.from) : undefined
    const starId = fromIsStar ? edge.from : toIsStar ? edge.to : undefined

    if (!starId || routeVertex?.shape !== 'dot') return
    if (!directRouteVerticesByStarId.has(starId)) {
      directRouteVerticesByStarId.set(starId, [])
    }
    directRouteVerticesByStarId.get(starId)?.push(routeVertex)

    const starIdsForRouter = directStarIdsByRouterId.get(routeVertex.id) ?? []
    starIdsForRouter.push(starId)
    directStarIdsByRouterId.set(routeVertex.id, starIdsForRouter)
  })

  starVertices.forEach((vertex) => {
    const point = starPositions.get(vertex.id)
    if (!point) return

    nodes.push({
      id: vertex.id,
      label: vertex.label,
      lat: point.lat,
      lon: point.lon,
      height: 90000,
      kind: 'star',
      hasExplicitGeo: knownStarPoints.includes(point),
      sourceId: vertex.id,
      group: vertex.group,
    })
  })

  starVertices.forEach((starVertex) => {
    const origin = starPositions.get(starVertex.id)
    if (!origin) return

    const directRouteVertices = directRouteVerticesByStarId.get(starVertex.id) ?? []

    directRouteVertices.forEach((vertex, index) => {
      const routeNodeId = `${starVertex.id}::${vertex.id}`
      const angle = (Math.PI * 2 * index) / Math.max(directRouteVertices.length, 1)
      const explicitPoint = getVertexGeo(vertex)
      const point = explicitPoint ?? makeOffsetPoint(origin, angle, 0.62)

      nodes.push({
        id: routeNodeId,
        label: vertex.label,
        lat: point.lat,
        lon: point.lon,
        height: 130000,
        kind: 'dot',
        parentId: starVertex.id,
        hasExplicitGeo: Boolean(explicitPoint),
        isIxRouter: true,
        sourceId: vertex.id,
        group: vertex.group,
      })
      routerPositions.set(routeNodeId, point)

      const sourceNodeIds = sourceNodeIdsByRouterId.get(vertex.id) ?? []
      sourceNodeIds.push(routeNodeId)
      sourceNodeIdsByRouterId.set(vertex.id, sourceNodeIds)

      globeEdges.push({
        from: starVertex.id,
        to: routeNodeId,
        label: edgeLabelByPair.get(getEdgeKey(starVertex.id, vertex.id)),
        surfaceCurve: Boolean(explicitPoint && pointDistance(origin, explicitPoint) >= ROUTER_SURFACE_CURVE_MIN_DISTANCE),
        keepLineColor: true,
      })
    })
  })

  routerVertices
    .filter((vertex) => !directStarIdsByRouterId.has(vertex.id))
    .forEach((vertex, index) => {
      const explicitPoint = getVertexGeo(vertex)
      const sameGroupDirectRouters = routerVertices.filter((candidate) => {
        return directStarIdsByRouterId.has(candidate.id) && String(candidate.group ?? '') === String(vertex.group ?? '')
      })
      const anchorRouter = sameGroupDirectRouters[index % Math.max(sameGroupDirectRouters.length, 1)]
      const anchorNodeId = anchorRouter ? sourceNodeIdsByRouterId.get(anchorRouter.id)?.[0] : undefined
      const anchorPoint = anchorNodeId ? routerPositions.get(anchorNodeId) : undefined
      const fallbackStarId = anchorRouter ? directStarIdsByRouterId.get(anchorRouter.id)?.[0] : undefined
      const fallbackStarPoint = fallbackStarId ? starPositions.get(fallbackStarId) : undefined
      const origin = anchorPoint ?? fallbackStarPoint ?? placedStarPoints[0] ?? { lat: 0, lon: 0 }
      const anchorKey = anchorNodeId ?? fallbackStarId ?? 'default'
      const anchorPlacementIndex = autoPlacedRouterCountByAnchor.get(anchorKey) ?? 0
      autoPlacedRouterCountByAnchor.set(anchorKey, anchorPlacementIndex + 1)
      const point = explicitPoint ?? makeOffsetPoint(origin, anchorPlacementIndex * 2.399963229728653, INTERNAL_ROUTER_AUTO_RADIUS)

      nodes.push({
        id: vertex.id,
        label: vertex.label,
        lat: point.lat,
        lon: point.lon,
        height: 130000,
        kind: 'dot',
        parentId: anchorNodeId ?? fallbackStarId,
        hasExplicitGeo: Boolean(explicitPoint),
        isIxRouter: false,
        sourceId: vertex.id,
        group: vertex.group,
      })
      routerPositions.set(vertex.id, point)
      sourceNodeIdsByRouterId.set(vertex.id, [vertex.id])
    })

  vertices
    .filter(isLocalNetworkVertex)
    .forEach((networkVertex) => {
      const routerNeighborIds = (adjacency.get(networkVertex.id) ?? [])
        .map((edge) => getOtherEdgeEnd(edge, networkVertex.id))
        .filter((id) => isRouterVertex(vertexById.get(id)))

      for (let leftIndex = 0; leftIndex < routerNeighborIds.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < routerNeighborIds.length; rightIndex += 1) {
          const leftSourceId = routerNeighborIds[leftIndex]!
          const rightSourceId = routerNeighborIds[rightIndex]!
          const leftNodeIds = sourceNodeIdsByRouterId.get(leftSourceId) ?? []
          const rightNodeIds = sourceNodeIdsByRouterId.get(rightSourceId) ?? []

          leftNodeIds.forEach((leftNodeId) => {
            rightNodeIds.forEach((rightNodeId) => {
              if (leftNodeId === rightNodeId) return

              const leftPoint = routerPositions.get(leftNodeId)
              const rightPoint = routerPositions.get(rightNodeId)

              globeEdges.push({
                from: leftNodeId,
                to: rightNodeId,
                label: networkVertex.label,
                surfaceCurve: Boolean(
                  leftPoint
                  && rightPoint
                  && pointDistance(leftPoint, rightPoint) >= ROUTER_SURFACE_CURVE_MIN_DISTANCE,
                ),
                internalRouterLink: true,
              })
            })
          })
        }
      }
    })

  return { nodes, edges: globeEdges }
}
