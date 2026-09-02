import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'
import type { GlobeEdge, GlobeGraph, GlobeNode } from '@/view/map/shared/services/globeGraph'

export type EmulatorTopologyVisibleTypes = {
  ix: boolean
  network: boolean
  router: boolean
  host: boolean
}

export type EmulatorTopologyGraphOptions = {
  visibleTypes: EmulatorTopologyVisibleTypes
  keyword: string
  selectedAsns?: string[]
  selectedIxNames?: string[]
}

export type EmulatorTopologyStats = {
  autonomousSystems: number
  ix: number
  networks: number
  routers: number
  hosts: number
  renderedNodes: number
  renderedLinks: number
}

type GeoPoint = {
  lat: number
  lon: number
}

type TopologyNetwork = {
  raw: EmulatorNetwork
  id: string
  label: string
  type: 'ix' | 'network'
  scope: string
  searchText: string
  searchDetail: string
  point?: GeoPoint
}

type TopologyContainer = {
  raw: EmulatorNode
  id: string
  label: string
  type: 'router' | 'host'
  asn: string
  searchText: string
  searchDetail: string
  point?: GeoPoint
  networkIds: string[]
}

const NODE_HEIGHT = 0
const ROUTER_OFFSET_RADIUS = 0.52
const HOST_OFFSET_RADIUS = 0.34
const GROUP_COLOR_PALETTE = [
  '#4aa3ff',
  '#34d399',
  '#f59e0b',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#f97316',
  '#84cc16',
  '#e879f9',
  '#60a5fa',
  '#facc15',
  '#2dd4bf',
  '#c084fc',
  '#f472b6',
  '#38bdf8',
  '#bef264',
]

function getGroupColor(group: string | undefined) {
  const key = group || 'default'
  return GROUP_COLOR_PALETTE[hashString(`group:${key}`) % GROUP_COLOR_PALETTE.length]
}

function normalizeLongitude(longitude: number) {
  return ((longitude + 540) % 360) - 180
}

function clampLatitude(latitude: number) {
  return Math.max(-85, Math.min(85, latitude))
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hashPoint(seed: string): GeoPoint {
  return {
    lat: -68 + (hashString(`${seed}:lat`) / 0xffffffff) * 136,
    lon: -170 + (hashString(`${seed}:lon`) / 0xffffffff) * 340,
  }
}

function averageGeoPoints(points: GeoPoint[]): GeoPoint | undefined {
  if (!points.length) return undefined

  let x = 0
  let y = 0
  let z = 0
  points.forEach((point) => {
    const latRad = (point.lat * Math.PI) / 180
    const lonRad = (point.lon * Math.PI) / 180
    const cosLat = Math.cos(latRad)
    x += cosLat * Math.cos(lonRad)
    y += cosLat * Math.sin(lonRad)
    z += Math.sin(latRad)
  })

  const length = Math.sqrt(x * x + y * y + z * z)
  if (length <= 0) return undefined

  return {
    lat: clampLatitude((Math.asin(z / length) * 180) / Math.PI),
    lon: normalizeLongitude((Math.atan2(y, x) * 180) / Math.PI),
  }
}

function offsetPoint(origin: GeoPoint, index: number, radius: number): GeoPoint {
  const angle = index * 2.399963229728653
  const ring = 1 + Math.floor(index / 12)
  const scaledRadius = radius * Math.sqrt(ring)
  const lonScale = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.18)

  return {
    lat: clampLatitude(origin.lat + Math.sin(angle) * scaledRadius),
    lon: normalizeLongitude(origin.lon + (Math.cos(angle) * scaledRadius) / lonScale),
  }
}

function parseCoordinate(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getGeoPoint(value?: Record<string, any>): GeoPoint | undefined {
  if (!value) return undefined
  const lat = parseCoordinate(value.latitude ?? value.lat ?? value.Latitude ?? value.LAT)
  const lon = parseCoordinate(value.longitude ?? value.lon ?? value.lng ?? value.Longitude ?? value.LON ?? value.LNG)
  if (lat === undefined || lon === undefined) return undefined
  if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }
  if (Math.abs(lon) <= 90 && Math.abs(lat) <= 180) return { lat: lon, lon: lat }
  return undefined
}

function getNetworkPoint(network: EmulatorNetwork) {
  return getGeoPoint(network.meta?.emulatorInfo as Record<string, any>) ?? getGeoPoint(network.meta as Record<string, any>)
}

function getNodePoint(node: EmulatorNode) {
  return getGeoPoint(node.meta?.emulatorInfo as Record<string, any>) ?? getGeoPoint(node.meta as Record<string, any>)
}

function getNetworkLabel(network: EmulatorNetwork) {
  const info = network.meta?.emulatorInfo
  return info?.displayname || `${info?.scope ?? ''}/${info?.name ?? network.Name ?? network.Id.slice(0, 12)}`
}

function getContainerLabel(node: EmulatorNode) {
  const info = node.meta?.emulatorInfo
  if (info?.displayname) return info.displayname
  if (info?.asn !== undefined && info?.name) return `${info.asn}/${info.name}`
  return info?.name || node.Names?.[0]?.replace(/^\//, '') || node.Id.slice(0, 12)
}

function getContainerType(node: EmulatorNode): TopologyContainer['type'] {
  const role = node.meta?.emulatorInfo?.role
  return ['Router', 'BorderRouter', 'Route Server'].includes(role) ? 'router' : 'host'
}

function isTransitRouterContainer(container: TopologyContainer) {
  return container.type === 'router' && /^r\d+$/i.test(container.raw.meta?.emulatorInfo?.name ?? container.label)
}

function getNodeNetworkSettingsText(node: EmulatorNode) {
  return Object.entries(node.NetworkSettings?.Networks ?? {})
    .map(([name, network]) => [
      name,
      network.NetworkID,
      network.IPAddress,
      network.MacAddress,
    ].filter(Boolean).join(' '))
    .join(' ')
}

function getNodeMetaNetsText(node: EmulatorNode) {
  return (node.meta?.emulatorInfo?.nets ?? [])
    .map((net) => `${net.name} ${net.address}`)
    .join(' ')
}

function getNetworkSearchText(network: EmulatorNetwork, label: string) {
  const info = network.meta?.emulatorInfo
  return [
    network.Id,
    network.Name,
    label,
    info?.scope,
    info?.name,
    info?.displayname,
    info?.type,
    info?.prefix,
    network.Labels && Object.values(network.Labels).join(' '),
  ].filter(Boolean).join(' ')
}

function getContainerSearchText(node: EmulatorNode, label: string) {
  const info = node.meta?.emulatorInfo
  return [
    node.Id,
    ...(node.Names ?? []),
    label,
    info?.asn,
    info?.name,
    info?.displayname,
    info?.role,
    info?.custom,
    info?.description,
    getNodeMetaNetsText(node),
    getNodeNetworkSettingsText(node),
    node.Labels && Object.values(node.Labels).join(' '),
  ].filter(Boolean).join(' ')
}

function toTopologyNetworks(networks: EmulatorNetwork[]): TopologyNetwork[] {
  return networks
    .filter((network) => Boolean(network?.Id && network?.meta?.emulatorInfo?.name))
    .map((network) => {
      const info = network.meta.emulatorInfo
      const label = getNetworkLabel(network)
      return {
        raw: network,
        id: network.Id,
        label,
        type: info.type === 'global' ? 'ix' : 'network',
        scope: String(info.scope ?? ''),
        searchText: getNetworkSearchText(network, label),
        searchDetail: `${info.type === 'global' ? 'IX' : 'Network'} · ${info.scope ?? ''}/${info.name ?? ''}${info.prefix ? ` · ${info.prefix}` : ''}`,
        point: getNetworkPoint(network),
      }
    })
}

function toTopologyContainers(nodes: EmulatorNode[]): TopologyContainer[] {
  return nodes
    .filter((node) => Boolean(node?.Id && node?.meta?.emulatorInfo?.name))
    .map((node) => {
      const label = getContainerLabel(node)
      const role = node.meta.emulatorInfo.role
      return {
        raw: node,
        id: node.Id,
        label,
        type: getContainerType(node),
        asn: String(node.meta.emulatorInfo.asn ?? 'unknown'),
        searchText: getContainerSearchText(node, label),
        searchDetail: `${role || 'Node'} · AS ${node.meta.emulatorInfo.asn ?? 'unknown'} · ${getNodeMetaNetsText(node) || node.Id.slice(0, 12)}`,
        point: getNodePoint(node),
        networkIds: Object.values(node.NetworkSettings?.Networks ?? {})
          .map((network) => network.NetworkID)
          .filter(Boolean),
      }
    })
}

function matchesKeyword(container: TopologyContainer, keyword: string) {
  if (!keyword) return true
  const lower = keyword.toLowerCase()
  const info = container.raw.meta?.emulatorInfo
  return [
    container.id,
    container.label,
    container.asn,
    info?.name,
    info?.displayname,
    info?.role,
    ...(info?.nets ?? []).map((net) => `${net.name} ${net.address}`),
    ...(container.raw.Names ?? []),
  ].some((value) => String(value ?? '').toLowerCase().includes(lower))
}

function networkVisible(network: TopologyNetwork, visibleTypes: EmulatorTopologyVisibleTypes) {
  return network.type === 'ix' ? visibleTypes.ix : visibleTypes.network
}

function containerVisible(container: TopologyContainer, visibleTypes: EmulatorTopologyVisibleTypes) {
  return container.type === 'router' ? visibleTypes.router : visibleTypes.host
}

function matchesTopologyFilter(
  container: TopologyContainer,
  selectedAsns: Set<string>,
  selectedIxNetworkIds: Set<string>,
) {
  if (selectedAsns.size === 0 && selectedIxNetworkIds.size === 0) return true
  if (selectedAsns.has(container.asn)) return true
  return container.networkIds.some((networkId) => selectedIxNetworkIds.has(networkId))
}

function buildNetworkNode(network: TopologyNetwork, point: GeoPoint): GlobeNode {
  const groupColor = getGroupColor(network.scope)
  return {
    id: network.id,
    label: network.label,
    lat: point.lat,
    lon: point.lon,
    height: NODE_HEIGHT,
    kind: network.type === 'ix' ? 'star' : 'diamond',
    sourceId: network.id,
    group: network.scope,
    color: groupColor,
    outlineColor: groupColor,
    hasExplicitGeo: Boolean(network.point),
    object: network.raw,
    searchText: network.searchText,
    searchDetail: network.searchDetail,
  }
}

function getContainerAnchorPoint(
  container: TopologyContainer,
  networkPointById: Map<string, GeoPoint>,
): GeoPoint {
  if (container.point) return container.point
  const parentPoint = container.networkIds.map((id) => networkPointById.get(id)).find(Boolean)
  return parentPoint ?? hashPoint(`as:${container.asn}`)
}

function resolveNetworkPoints(networks: TopologyNetwork[], containers: TopologyContainer[]) {
  const pointByNetworkId = new Map<string, GeoPoint>()

  networks
    .filter((network) => network.type === 'ix' || network.point)
    .forEach((network) => {
      pointByNetworkId.set(network.id, network.point ?? hashPoint(`network:${network.id}`))
    })

  networks
    .filter((network) => network.type === 'network' && !network.point)
    .forEach((network) => {
      const endpointPoints = containers
        .filter((container) => container.networkIds.includes(network.id))
        .map((container) => getContainerAnchorPoint(container, pointByNetworkId))
      pointByNetworkId.set(network.id, averageGeoPoints(endpointPoints) ?? hashPoint(`network:${network.id}`))
    })

  networks.forEach((network) => {
    if (!pointByNetworkId.has(network.id)) {
      pointByNetworkId.set(network.id, hashPoint(`network:${network.id}`))
    }
  })

  return pointByNetworkId
}

function buildContainerNode(
  container: TopologyContainer,
  networkNodeById: Map<string, GlobeNode>,
  placedCountByParent: Map<string, number>,
): GlobeNode {
  const parentNode = container.networkIds.map((id) => networkNodeById.get(id)).find(Boolean)
  const parentPoint = parentNode ? { lat: parentNode.lat, lon: parentNode.lon } : hashPoint(`as:${container.asn}`)
  const parentKey = parentNode?.id ?? `as:${container.asn}`
  const index = placedCountByParent.get(parentKey) ?? 0
  placedCountByParent.set(parentKey, index + 1)

  const point = container.point ?? offsetPoint(parentPoint, index, container.type === 'router' ? ROUTER_OFFSET_RADIUS : HOST_OFFSET_RADIUS)
  const groupColor = getGroupColor(container.asn)
  return {
    id: container.id,
    label: container.label,
    lat: point.lat,
    lon: point.lon,
    height: NODE_HEIGHT,
    kind: container.type === 'router' ? 'dot' : 'hexagon',
    parentId: parentKey,
    sourceId: container.id,
    group: container.asn,
    color: groupColor,
    outlineColor: groupColor,
    isIxRouter: container.type === 'router',
    hasExplicitGeo: Boolean(container.point),
    object: container.raw,
    searchText: container.searchText,
    searchDetail: container.searchDetail,
  }
}

export function createEmulatorTopologyGraph(
  rawContainers: EmulatorNode[],
  rawNetworks: EmulatorNetwork[],
  options: EmulatorTopologyGraphOptions,
): { graph: GlobeGraph; stats: EmulatorTopologyStats; expandedParentIds: string[] } {
  const networks = toTopologyNetworks(rawNetworks)
  const containers = toTopologyContainers(rawContainers)
  const keyword = options.keyword.trim()
  const selectedAsns = new Set((options.selectedAsns ?? []).map(String))
  const selectedIxNames = new Set((options.selectedIxNames ?? []).map(String))
  const selectedIxNetworkIds = new Set(
    networks
      .filter((network) => network.type === 'ix')
      .filter((network) => selectedIxNames.has(network.raw.meta?.emulatorInfo?.name ?? network.label))
      .map((network) => network.id),
  )
  const networkPointById = resolveNetworkPoints(networks, containers)
  const visibleContainers = containers
    .filter((container) => containerVisible(container, options.visibleTypes))
    .filter((container) => matchesTopologyFilter(container, selectedAsns, selectedIxNetworkIds))
    .filter((container) => matchesKeyword(container, keyword))
  const visibleContainerNetworkIds = new Set(visibleContainers.flatMap((container) => container.networkIds))
  const networkNodes = networks
    .filter((network) => networkVisible(network, options.visibleTypes))
    .filter((network) => {
      if (selectedIxNames.size > 0 && network.type === 'ix') return selectedIxNetworkIds.has(network.id)
      if (selectedAsns.size > 0 || selectedIxNames.size > 0) return visibleContainerNetworkIds.has(network.id) || selectedIxNetworkIds.has(network.id)
      return true
    })
    .map((network) => buildNetworkNode(network, networkPointById.get(network.id) ?? hashPoint(`network:${network.id}`)))
  const networkNodeById = new Map(networkNodes.map((node) => [node.id, node]))
  const limitedContainers = visibleContainers
  const placedCountByParent = new Map<string, number>()
  const containerNodes = limitedContainers.map((container) => buildContainerNode(container, networkNodeById, placedCountByParent))
  const visibleNodeIds = new Set([...networkNodes, ...containerNodes].map((node) => node.id))
  const edges: GlobeEdge[] = []
  const addedEdges = new Set<string>()

  if (options.visibleTypes.network) {
    limitedContainers.forEach((container) => {
      container.networkIds.forEach((networkId) => {
        if (!visibleNodeIds.has(networkId)) return
        const key = `${container.id}:${networkId}`
        if (addedEdges.has(key)) return
        edges.push({
          from: container.id,
          to: networkId,
          surfaceCurve: true,
          keepLineColor: true,
        })
        addedEdges.add(key)
      })
    })
  }

  const graph = {
    nodes: [...networkNodes, ...containerNodes],
    edges,
  }

  return {
    graph,
    stats: {
      ix: networks.filter((network) => network.type === 'ix').length,
      autonomousSystems: new Set(containers.filter(isTransitRouterContainer).map((container) => container.asn)).size,
      networks: networks.filter((network) => network.type === 'network').length,
      routers: containers.filter((container) => container.type === 'router').length,
      hosts: containers.filter((container) => container.type === 'host').length,
      renderedNodes: graph.nodes.length,
      renderedLinks: graph.edges.length,
    },
    expandedParentIds: Array.from(
      graph.nodes.reduce((ids, node) => {
        ids.add(node.id)
        if (node.parentId) ids.add(node.parentId)
        return ids
      }, new Set<string>()),
    ),
  }
}
