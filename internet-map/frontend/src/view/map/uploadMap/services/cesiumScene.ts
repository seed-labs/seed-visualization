import {
  BillboardCollection,
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  ImageryLayer,
  Ion,
  LabelCollection,
  LabelStyle,
  Math as CesiumMath,
  Material,
  NearFarScalar,
  PointPrimitiveCollection,
  PolylineCollection,
  SceneMode,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  WebMercatorTilingScheme,
} from 'cesium'
import type { GlobeGraph, GlobeNode } from './globeGraph'

Ion.defaultAccessToken = ''

const EARTH_TILE_URL = import.meta.env.VITE_SATELLITE_TILES_URL
const EARTH_TILE_CREDIT = 'satellitemap.space'
const EARTH_TILE_MINIMUM_LEVEL = 2
const EARTH_TILE_MAXIMUM_LEVEL = 7
const EARTH_TILE_SIZE = 512
const STAR_COLOR = Color.fromCssColorString('#ffcc33')
const STAR_OUTLINE_COLOR = Color.fromCssColorString('#ff4a2a')
const DOT_COLOR = Color.fromCssColorString('#2388d9')
const DOT_OUTLINE_COLOR = Color.fromCssColorString('#9bdcff')
const NODE_COLOR = Color.fromCssColorString('#7de8ff')
const HIGHLIGHT_COLOR = Color.fromCssColorString('#c08cff')
const HIGHLIGHT_OUTLINE_COLOR = Color.fromCssColorString('#f0ddff')
const LINE_COLOR = Color.fromCssColorString('#3bb8ff').withAlpha(0.48)
const HIGHLIGHT_LINE_COLOR = Color.fromCssColorString('#a56bff').withAlpha(0.86)
const SURFACE_CURVE_LINE_COLOR = Color.fromCssColorString('#ff4a2a').withAlpha(0.88)
const INTERNAL_ROUTER_LINE_COLOR = Color.fromCssColorString('#38d996').withAlpha(0.72)
const GRID_COLOR = Color.fromCssColorString('#6ee7ff').withAlpha(0.16)
const STAR_IMAGE_SIZE = 128
const LINK_SPREAD_MULTIPLIER = 1.35
const SAME_PARENT_CURVE_HEIGHT = 230_000
const SURFACE_CURVE_HEIGHT = 45_000
const SURFACE_CURVE_SEGMENTS = 56
const MAX_AVOIDANCE_SEGMENTS = 220
const MAX_AVOIDANCE_POINTS = 260
const AVOIDANCE_PARENT_DISTANCE = 52

type GeoPoint = {
  lat: number
  lon: number
}

type RenderSegment = {
  from: GeoPoint
  to: GeoPoint
}

export type UploadMap3DSceneApi = {
  viewer: Viewer
  renderGraph: (graph: GlobeGraph, options?: UploadMap3DRenderOptions) => void
  orientToGraph: (graph: GlobeGraph) => void
  onNodeClick: (handler: (node: GlobeNode) => void) => void
  destroy: () => void
}

export type UploadMap3DRenderOptions = {
  nodeScale?: number
  showRouterLabels?: boolean
  expandedRouterParentIds?: string[]
}

function createColorMaterial(color: Color) {
  return Material.fromType('Color', { color })
}

function createMeridianPositions(longitude: number) {
  const degrees: number[] = []
  for (let latitude = -90; latitude <= 90; latitude += 2) {
    degrees.push(longitude, latitude)
  }

  return Cartesian3.fromDegreesArray(degrees)
}

function createParallelPositions(latitude: number) {
  const degrees: number[] = []
  for (let longitude = -180; longitude <= 180; longitude += 2) {
    degrees.push(longitude, latitude)
  }

  return Cartesian3.fromDegreesArray(degrees)
}

function addReferenceGrid(gridLines: PolylineCollection) {
  for (let longitude = -180; longitude <= 180; longitude += 15) {
    gridLines.add({
      positions: createMeridianPositions(longitude),
      width: longitude % 45 === 0 ? 0.8 : 0.45,
      material: createColorMaterial(GRID_COLOR),
    })
  }

  for (let latitude = -75; latitude <= 75; latitude += 15) {
    gridLines.add({
      positions: createParallelPositions(latitude),
      width: latitude % 45 === 0 ? 0.8 : 0.45,
      material: createColorMaterial(GRID_COLOR),
    })
  }
}

function getNodeColor(node: GlobeNode) {
  if (node.highlighted) return HIGHLIGHT_COLOR
  if (node.kind === 'star') return STAR_COLOR
  if (node.kind === 'dot') return DOT_COLOR
  return NODE_COLOR
}

function getNodeFillColor(node: GlobeNode) {
  if (node.kind === 'dot' && node.highlighted) return Color.TRANSPARENT
  return getNodeColor(node)
}

function getNodeSize(node: GlobeNode) {
  if (node.kind === 'star') return 14
  if (node.kind === 'dot') return node.highlighted ? 2.4 : 4.5
  if (node.highlighted) return 7
  return 7.5
}

function getNodeOutlineColor(node: GlobeNode) {
  if (node.highlighted) return HIGHLIGHT_OUTLINE_COLOR
  if (node.kind === 'star') return STAR_OUTLINE_COLOR
  if (node.kind === 'dot') return DOT_OUTLINE_COLOR
  return Color.WHITE.withAlpha(0.38)
}

function getNodeOutlineWidth(node: GlobeNode, nodeScale: number) {
  const scale = Math.min(nodeScale, 2.5)
  if (node.kind === 'star') return 1.4 * scale
  if (node.kind === 'dot') return (node.highlighted ? 1.6 : 1.1) * scale
  if (node.highlighted) return 2 * scale
  return 1.1 * scale
}

function getLabelFont(node: GlobeNode, nodeScale: number) {
  const baseSize = node.highlighted ? 14 : node.kind === 'star' ? 15 : 12
  const fontSize = Math.round(baseSize * Math.min(nodeScale, 3))
  return `${node.highlighted || node.kind === 'star' ? '700' : '500'} ${fontSize}px sans-serif`
}

function getLabelOffset(node: GlobeNode, nodeScale: number) {
  const baseOffset = node.highlighted ? -24 : node.kind === 'star' ? -24 : -16
  return new Cartesian2(0, baseOffset * Math.min(nodeScale, 3))
}

function getRenderHeight(node: GlobeNode, nodeScale: number) {
  const lift = Math.max(0, nodeScale - 1) * 45_000
  return node.height + lift
}

function getLineWidth(nodeScale: number) {
  return Math.max(0.9, Math.min(3.2, 0.92 * nodeScale))
}

function getEdgeMaterial(from: GlobeNode, to: GlobeNode) {
  return createColorMaterial(from.highlighted && to.highlighted ? HIGHLIGHT_LINE_COLOR : LINE_COLOR)
}

function getRenderEdgeMaterial(edge: { surfaceCurve?: boolean; keepLineColor?: boolean; internalRouterLink?: boolean }, from: GlobeNode, to: GlobeNode) {
  if (edge.internalRouterLink) return createColorMaterial(INTERNAL_ROUTER_LINE_COLOR)
  return edge.surfaceCurve && !edge.keepLineColor
    ? createColorMaterial(SURFACE_CURVE_LINE_COLOR)
    : getEdgeMaterial(from, to)
}

function getEdgeWidth(from: GlobeNode, to: GlobeNode, nodeScale: number) {
  const width = getLineWidth(nodeScale)
  return from.highlighted && to.highlighted ? width * 1.35 : width
}

function normalizeLongitude(longitude: number) {
  return ((longitude + 540) % 360) - 180
}

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value))
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI
}

function getUnitSpherePoint(point: GeoPoint) {
  const lat = toRadians(point.lat)
  const lon = toRadians(point.lon)
  const cosLat = Math.cos(lat)

  return {
    x: cosLat * Math.cos(lon),
    y: cosLat * Math.sin(lon),
    z: Math.sin(lat),
  }
}

function normalizeVector(vector: ReturnType<typeof getUnitSpherePoint>) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

function vectorToGeoPoint(vector: ReturnType<typeof getUnitSpherePoint>): GeoPoint {
  const normalized = normalizeVector(vector)
  return {
    lat: toDegrees(Math.asin(clampUnit(normalized.z))),
    lon: normalizeLongitude(toDegrees(Math.atan2(normalized.y, normalized.x))),
  }
}

function getSurfaceCurvePositions(from: GeoPoint, to: GeoPoint) {
  const start = getUnitSpherePoint(from)
  const end = getUnitSpherePoint(to)
  const omega = Math.acos(clampUnit(start.x * end.x + start.y * end.y + start.z * end.z))
  const sinOmega = Math.sin(omega)

  if (omega < 0.0001 || Math.abs(sinOmega) < 0.0001) {
    return [
      Cartesian3.fromDegrees(from.lon, from.lat, SURFACE_CURVE_HEIGHT),
      Cartesian3.fromDegrees(to.lon, to.lat, SURFACE_CURVE_HEIGHT),
    ]
  }

  const positions: Cartesian3[] = []
  for (let index = 0; index <= SURFACE_CURVE_SEGMENTS; index += 1) {
    const t = index / SURFACE_CURVE_SEGMENTS
    const startScale = Math.sin((1 - t) * omega) / sinOmega
    const endScale = Math.sin(t * omega) / sinOmega
    const point = vectorToGeoPoint({
      x: start.x * startScale + end.x * endScale,
      y: start.y * startScale + end.y * endScale,
      z: start.z * startScale + end.z * endScale,
    })

    positions.push(Cartesian3.fromDegrees(point.lon, point.lat, SURFACE_CURVE_HEIGHT))
  }

  return positions
}

function getSameParentCurvePositions(from: GlobeNode, to: GlobeNode, renderGeos: Map<string, GeoPoint>, nodeScale: number) {
  const fromPoint = getRenderGeoPoint(from, renderGeos)
  const toPoint = getRenderGeoPoint(to, renderGeos)
  const midLat = (fromPoint.lat + toPoint.lat) / 2
  const midLon = normalizeLongitude(fromPoint.lon + getLongitudeDelta(fromPoint.lon, toPoint.lon) / 2)
  const dx = getLongitudeDelta(fromPoint.lon, toPoint.lon) * getLonScale(midLat)
  const dy = toPoint.lat - fromPoint.lat
  const length = Math.max(Math.hypot(dx, dy), 0.001)
  const offset = Math.max(0.34, Math.min(0.9, length * 0.32))
  const side = from.id < to.id ? 1 : -1
  const control = {
    lat: clampLatitude(midLat + (dx / length) * offset * side),
    lon: normalizeLongitude(midLon - (dy / length) * offset * side / getLonScale(midLat)),
  }

  return [
    getRenderPosition(from, renderGeos, nodeScale),
    Cartesian3.fromDegrees(control.lon, control.lat, SAME_PARENT_CURVE_HEIGHT + getRenderHeight(from, nodeScale)),
    getRenderPosition(to, renderGeos, nodeScale),
  ]
}

function getLongitudeDelta(from: number, to: number) {
  return normalizeLongitude(to - from)
}

function geoDistance(a: GeoPoint, b: GeoPoint) {
  const latScale = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const lonDelta = getLongitudeDelta(b.lon, a.lon) * Math.max(latScale, 0.18)
  return Math.hypot(lonDelta, a.lat - b.lat)
}

function clampLatitude(latitude: number) {
  return Math.max(-85, Math.min(85, latitude))
}

function getLonScale(latitude: number) {
  return Math.max(Math.cos((latitude * Math.PI) / 180), 0.18)
}

function pointForSegment(point: GeoPoint, originLon: number) {
  let lon = point.lon
  while (lon - originLon > 180) lon -= 360
  while (lon - originLon < -180) lon += 360
  return { x: lon, y: point.lat }
}

function orientation(
  a: ReturnType<typeof pointForSegment>,
  b: ReturnType<typeof pointForSegment>,
  c: ReturnType<typeof pointForSegment>,
) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function segmentsIntersect(candidate: RenderSegment, placed: RenderSegment) {
  const originLon = candidate.from.lon
  const a = pointForSegment(candidate.from, originLon)
  const b = pointForSegment(candidate.to, originLon)
  const c = pointForSegment(placed.from, originLon)
  const d = pointForSegment(placed.to, originLon)

  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  return abC * abD < 0 && cdA * cdB < 0
}

function distanceToSegment(
  point: ReturnType<typeof pointForSegment>,
  segmentStart: ReturnType<typeof pointForSegment>,
  segmentEnd: ReturnType<typeof pointForSegment>,
) {
  const dx = segmentEnd.x - segmentStart.x
  const dy = segmentEnd.y - segmentStart.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y)

  const t = Math.max(0, Math.min(1, ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (segmentStart.x + t * dx), point.y - (segmentStart.y + t * dy))
}

function segmentDistance(candidate: RenderSegment, placed: RenderSegment) {
  const originLon = candidate.from.lon
  const a = pointForSegment(candidate.from, originLon)
  const b = pointForSegment(candidate.to, originLon)
  const c = pointForSegment(placed.from, originLon)
  const d = pointForSegment(placed.to, originLon)

  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  )
}

function pointDistance(a: GeoPoint, b: GeoPoint) {
  return Math.hypot(getLongitudeDelta(b.lon, a.lon), a.lat - b.lat)
}

function makeSpreadPoint(parent: GlobeNode, node: GlobeNode, angle: number, spreadScale: number): GeoPoint {
  const lonScale = getLonScale(parent.lat)
  const latDelta = node.lat - parent.lat
  const lonDelta = getLongitudeDelta(parent.lon, node.lon) * lonScale
  const baseDistance = Math.max(Math.hypot(lonDelta, latDelta), 0.18)
  const distance = baseDistance * spreadScale

  return {
    lat: clampLatitude(parent.lat + Math.sin(angle) * distance),
    lon: normalizeLongitude(parent.lon + (Math.cos(angle) * distance) / lonScale),
  }
}

function getBaseAngle(parent: GlobeNode, node: GlobeNode) {
  const lonDelta = getLongitudeDelta(parent.lon, node.lon) * getLonScale(parent.lat)
  return Math.atan2(node.lat - parent.lat, lonDelta)
}

function createCandidateAngles(parent: GlobeNode, node: GlobeNode) {
  const baseAngle = getBaseAngle(parent, node)
  const offsets = [0, 0.22, -0.22, 0.44, -0.44, 0.7, -0.7, 1.0, -1.0, 1.35, -1.35, 1.75, -1.75, Math.PI]
  return offsets.map((offset) => baseAngle + offset)
}

function scoreRenderPoint(parentPoint: GeoPoint, point: GeoPoint, placedSegments: RenderSegment[], placedPoints: GeoPoint[], spreadScale: number) {
  const candidate = { from: parentPoint, to: point }
  let score = 0
  const nearLineThreshold = 0.16 * Math.max(1, spreadScale * 0.35)
  const nearPointThreshold = 0.2 * Math.max(1, spreadScale * 0.28)

  placedSegments.forEach((segment) => {
    if (segmentsIntersect(candidate, segment)) {
      score += 100_000
      return
    }

    const distance = segmentDistance(candidate, segment)
    if (distance < nearLineThreshold) {
      score += (nearLineThreshold - distance) * 600
    }
  })

  placedPoints.forEach((placedPoint) => {
    const distance = pointDistance(point, placedPoint)
    if (distance < nearPointThreshold) {
      score += (nearPointThreshold - distance) * 260
    }
  })

  return score
}

function getLocalSegments(parentPoint: GeoPoint, placedSegments: RenderSegment[]) {
  const localSegments = placedSegments.filter((segment) => geoDistance(parentPoint, segment.from) <= AVOIDANCE_PARENT_DISTANCE)
  return localSegments.length > MAX_AVOIDANCE_SEGMENTS
    ? localSegments.slice(localSegments.length - MAX_AVOIDANCE_SEGMENTS)
    : localSegments
}

function getLocalPoints(parentPoint: GeoPoint, placedPoints: GeoPoint[]) {
  const localPoints = placedPoints.filter((point) => geoDistance(parentPoint, point) <= AVOIDANCE_PARENT_DISTANCE)
  return localPoints.length > MAX_AVOIDANCE_POINTS
    ? localPoints.slice(localPoints.length - MAX_AVOIDANCE_POINTS)
    : localPoints
}

function chooseAvoidedPoint(
  candidates: GeoPoint[],
  parentPoint: GeoPoint,
  placedSegments: RenderSegment[],
  placedPoints: GeoPoint[],
  spreadScale: number,
): GeoPoint {
  const localSegments = getLocalSegments(parentPoint, placedSegments)
  const localPoints = getLocalPoints(parentPoint, placedPoints)
  let bestPoint = candidates[0]!
  let bestScore = Number.POSITIVE_INFINITY

  candidates.forEach((candidate) => {
    const score = scoreRenderPoint(parentPoint, candidate, localSegments, localPoints, spreadScale)
    if (score < bestScore) {
      bestScore = score
      bestPoint = candidate
    }
  })

  return bestPoint
}

function getAvoidedRenderGeos(renderNodes: GlobeNode[], nodeById: Map<string, GlobeNode>, spreadScale: number) {
  const renderGeos = new Map<string, GeoPoint>()
  const placedSegments: RenderSegment[] = []
  const placedPoints: GeoPoint[] = []

  renderNodes.forEach((node) => {
    if (!node.parentId) {
      const point = { lat: node.lat, lon: node.lon }
      renderGeos.set(node.id, point)
      placedPoints.push(point)
    }
  })

  renderNodes
    .filter((node) => node.parentId && node.hasExplicitGeo)
    .forEach((node) => {
      const point = { lat: node.lat, lon: node.lon }
      const parent = nodeById.get(node.parentId!)
      const parentPoint = parent
        ? renderGeos.get(parent.id) ?? { lat: parent.lat, lon: parent.lon }
        : undefined

      renderGeos.set(node.id, point)
      placedPoints.push(point)
      if (parentPoint) {
        placedSegments.push({ from: parentPoint, to: point })
      }
    })

  renderNodes
    .filter((node) => node.parentId && !node.hasExplicitGeo && nodeById.has(node.parentId))
    .forEach((node) => {
      const parent = nodeById.get(node.parentId!)
      if (!parent) return

      const parentPoint = renderGeos.get(parent.id) ?? { lat: parent.lat, lon: parent.lon }
      const candidates = createCandidateAngles(parent, node).map((angle) => makeSpreadPoint(parent, node, angle, spreadScale))
      const point = chooseAvoidedPoint(candidates, parentPoint, placedSegments, placedPoints, spreadScale)

      renderGeos.set(node.id, point)
      placedSegments.push({ from: parentPoint, to: point })
      placedPoints.push(point)
    })

  return renderGeos
}

function getRenderPosition(node: GlobeNode, renderGeos: Map<string, GeoPoint>, nodeScale: number) {
  const point = renderGeos.get(node.id) ?? { lat: node.lat, lon: node.lon }
  return Cartesian3.fromDegrees(point.lon, point.lat, getRenderHeight(node, nodeScale))
}

function getRenderGeoPoint(node: GlobeNode, renderGeos: Map<string, GeoPoint>) {
  return renderGeos.get(node.id) ?? { lat: node.lat, lon: node.lon }
}

function clampNodeScale(value = 2) {
  return Math.max(0.5, Math.min(4, value))
}

function getFrontNode(graph: GlobeGraph) {
  return graph.nodes.find((node) => node.hasExplicitGeo && node.kind === 'star')
    ?? graph.nodes.find((node) => node.hasExplicitGeo)
    ?? graph.nodes.find((node) => node.kind === 'star')
    ?? graph.nodes[0]
}

function createStarImage(fillColor: string, outlineColor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = STAR_IMAGE_SIZE
  canvas.height = STAR_IMAGE_SIZE
  const context = canvas.getContext('2d')
  if (!context) return canvas

  const center = STAR_IMAGE_SIZE / 2
  const outerRadius = STAR_IMAGE_SIZE * 0.42
  const innerRadius = STAR_IMAGE_SIZE * 0.18

  context.beginPath()
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius
    const angle = -Math.PI / 2 + (Math.PI * index) / 5
    const x = center + Math.cos(angle) * radius
    const y = center + Math.sin(angle) * radius
    if (index === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  }
  context.closePath()
  context.fillStyle = fillColor
  context.strokeStyle = outlineColor
  context.lineWidth = 8
  context.shadowColor = fillColor
  context.shadowBlur = 18
  context.fill()
  context.shadowBlur = 0
  context.stroke()

  return canvas
}

function shouldRenderRouterNode(node: GlobeNode, expandedRouterParentIds: Set<string>) {
  if (node.kind !== 'dot') return true
  if (node.highlighted) return true
  return Boolean(node.isIxRouter && node.parentId && expandedRouterParentIds.has(node.parentId))
}

function shouldRenderLabel(node: GlobeNode, showRouterLabels: boolean) {
  if (node.kind !== 'dot') return true
  return showRouterLabels
}

export function createUploadMap3DScene(container: HTMLElement): UploadMap3DSceneApi {
  const baseLayer = new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: EARTH_TILE_URL,
      credit: EARTH_TILE_CREDIT,
      tilingScheme: new WebMercatorTilingScheme(),
      minimumLevel: EARTH_TILE_MINIMUM_LEVEL,
      maximumLevel: EARTH_TILE_MAXIMUM_LEVEL,
      tileWidth: EARTH_TILE_SIZE,
      tileHeight: EARTH_TILE_SIZE,
    }),
  )

  baseLayer.brightness = 0.9
  baseLayer.contrast = 1.08
  baseLayer.saturation = 1.08
  baseLayer.gamma = 0.92

  const viewer = new Viewer(container, {
    animation: false,
    baseLayer,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneMode: SceneMode.SCENE3D,
    sceneModePicker: false,
    selectionIndicator: false,
    shouldAnimate: true,
    timeline: false,
  })

  viewer.scene.globe.depthTestAgainstTerrain = false
  viewer.scene.globe.enableLighting = false
  viewer.scene.globe.baseColor = Color.fromCssColorString('#0a2140')
  viewer.scene.backgroundColor = Color.fromCssColorString('#020815')
  viewer.scene.globe.maximumScreenSpaceError = 1
  viewer.scene.globe.tileCacheSize = 500
  viewer.scene.globe.showGroundAtmosphere = true
  viewer.scene.globe.atmosphereHueShift = 0
  viewer.scene.globe.atmosphereSaturationShift = -0.15
  viewer.scene.globe.atmosphereBrightnessShift = -0.34

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true
    viewer.scene.skyAtmosphere.hueShift = 0
    viewer.scene.skyAtmosphere.saturationShift = -0.35
    viewer.scene.skyAtmosphere.brightnessShift = -0.42
  }

  viewer.scene.postProcessStages.bloom.enabled = true
  viewer.scene.postProcessStages.bloom.uniforms.glowOnly = false
  viewer.scene.postProcessStages.bloom.uniforms.contrast = 120
  viewer.scene.postProcessStages.bloom.uniforms.brightness = -0.25
  viewer.scene.postProcessStages.bloom.uniforms.delta = 1.1
  viewer.scene.postProcessStages.bloom.uniforms.sigma = 2.2
  viewer.scene.postProcessStages.bloom.uniforms.stepSize = 1

  const gridLines = viewer.scene.primitives.add(new PolylineCollection())
  addReferenceGrid(gridLines)

  const lines = viewer.scene.primitives.add(new PolylineCollection())
  const points = viewer.scene.primitives.add(new PointPrimitiveCollection())
  const billboards = viewer.scene.primitives.add(new BillboardCollection())
  const labels = viewer.scene.primitives.add(new LabelCollection())
  const starImage = createStarImage('#ffcc33', '#ff4a2a')
  const highlightedStarImage = createStarImage('#ff5a3d', '#ffe066')
  const hoveredStarImage = createStarImage('#ffe066', '#ff1f1f')
  const starBillboards = new Map<string, any>()
  const starNodes = new Map<string, GlobeNode>()
  let hoveredStarId: string | undefined
  let nodeClickHandler: ((node: GlobeNode) => void) | undefined

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(106, 24, 18_000_000),
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(-90),
      roll: 0,
    },
  })

  function renderGraph(graph: GlobeGraph, options: UploadMap3DRenderOptions = {}) {
    points.removeAll()
    billboards.removeAll()
    labels.removeAll()
    lines.removeAll()
    starBillboards.clear()
    starNodes.clear()
    hoveredStarId = undefined

    const nodeScale = options.nodeScale ?? 2
    const showRouterLabels = options.showRouterLabels ?? true
    const expandedRouterParentIds = new Set(options.expandedRouterParentIds ?? [])
    const pointScale = clampNodeScale(nodeScale)
    const spreadScale = pointScale * LINK_SPREAD_MULTIPLIER
    const renderNodes = graph.nodes.filter((node) => shouldRenderRouterNode(node, expandedRouterParentIds))

    const nodeById = new Map(renderNodes.map((node) => [node.id, node]))
    const renderGeos = getAvoidedRenderGeos(renderNodes, nodeById, spreadScale)

    graph.edges.forEach((edge) => {
      const from = nodeById.get(edge.from)
      const to = nodeById.get(edge.to)
      if (!from || !to) return

      const sameParentRouterEdge = !edge.internalRouterLink && from.kind === 'dot' && to.kind === 'dot' && from.parentId && from.parentId === to.parentId
      const positions = sameParentRouterEdge
        ? getSameParentCurvePositions(from, to, renderGeos, pointScale)
        : edge.surfaceCurve
        ? getSurfaceCurvePositions(getRenderGeoPoint(from, renderGeos), getRenderGeoPoint(to, renderGeos))
        : [
          getRenderPosition(from, renderGeos, pointScale),
          getRenderPosition(to, renderGeos, pointScale),
        ]

      lines.add({
        positions,
        width: getEdgeWidth(from, to, pointScale),
        material: getRenderEdgeMaterial(edge, from, to),
      })
    })

    renderNodes.forEach((node) => {
      const position = getRenderPosition(node, renderGeos, pointScale)
      if (node.kind === 'star') {
        const billboard = billboards.add({
          id: node,
          image: node.highlighted ? highlightedStarImage : starImage,
          position,
          width: getNodeSize(node) * pointScale,
          height: getNodeSize(node) * pointScale,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1_500_000, node.highlighted ? 1.35 : 1.18, 18_000_000, node.highlighted ? 0.72 : 0.58),
        })
        starBillboards.set(node.id, billboard)
        starNodes.set(node.id, node)
      } else {
        points.add({
          id: node,
          position,
          pixelSize: getNodeSize(node) * pointScale,
          color: getNodeFillColor(node),
          outlineColor: getNodeOutlineColor(node),
          outlineWidth: getNodeOutlineWidth(node, pointScale),
          scaleByDistance: new NearFarScalar(1_500_000, node.highlighted ? 1.5 : 1.25, 18_000_000, node.highlighted ? 0.72 : 0.58),
        })
      }

      if (shouldRenderLabel(node, showRouterLabels)) {
        labels.add({
          position,
          text: node.label,
          font: getLabelFont(node, pointScale),
          fillColor: getNodeColor(node),
          outlineColor: Color.BLACK.withAlpha(0.92),
          outlineWidth: node.highlighted ? 5 : 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: getLabelOffset(node, pointScale),
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1_500_000, node.highlighted ? 1.15 : 1, 14_000_000, node.highlighted ? 0.36 : node.kind === 'star' ? 0.35 : 0.18),
        })
      }
    })
  }

  function pickGlobeNode(position: Cartesian2) {
    const pickedObjects = viewer.scene.drillPick(position, 12) as Array<{ id?: GlobeNode }>
    const pickedNodes = pickedObjects
      .map((picked) => picked.id)
      .filter((node): node is GlobeNode => Boolean(node?.id))

    return pickedNodes.find((node) => node.kind === 'star') ?? pickedNodes[0]
  }

  function setHoveredStar(nextStarId?: string) {
    if (hoveredStarId === nextStarId) return

    if (hoveredStarId) {
      const previousBillboard = starBillboards.get(hoveredStarId)
      const previousNode = starNodes.get(hoveredStarId)
      if (previousBillboard && previousNode) {
        previousBillboard.image = previousNode.highlighted ? highlightedStarImage : starImage
        previousBillboard.scale = 1
      }
    }

    hoveredStarId = nextStarId

    if (hoveredStarId) {
      const billboard = starBillboards.get(hoveredStarId)
      if (billboard) {
        billboard.image = hoveredStarImage
        billboard.scale = 1.42
      }
    }

    viewer.canvas.style.cursor = hoveredStarId ? 'pointer' : ''
  }

  function orientToGraph(graph: GlobeGraph) {
    const frontNode = getFrontNode(graph)
    if (!frontNode) return

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(frontNode.lon, frontNode.lat, 18_000_000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
    })
  }

  return {
    viewer,
    renderGraph,
    orientToGraph,
    onNodeClick(handler: (node: GlobeNode) => void) {
      nodeClickHandler = handler
      viewer.screenSpaceEventHandler.setInputAction((event: { endPosition: Cartesian2 }) => {
        const pickedNode = pickGlobeNode(event.endPosition)
        setHoveredStar(pickedNode?.kind === 'star' ? pickedNode.id : undefined)
      }, ScreenSpaceEventType.MOUSE_MOVE)
      viewer.screenSpaceEventHandler.setInputAction((event: { position: Cartesian2 }) => {
        const pickedNode = pickGlobeNode(event.position)
        if (!pickedNode?.id) return
        nodeClickHandler?.(pickedNode)
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    },
    destroy() {
      viewer.destroy()
    },
  }
}
