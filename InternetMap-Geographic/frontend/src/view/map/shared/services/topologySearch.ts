import type { GlobeNode } from '@/view/map/shared/services/globeGraph'
import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'

export type TopologySearchSuggestion = {
  value: string
  nodeId: string
  label: string
  type: string
  detail: string
}

const MAX_SUGGESTIONS = 12

function nodeTypeLabel(node: GlobeNode) {
  switch (node.kind) {
    case 'star':
      return 'IX'
    case 'diamond':
      return 'Network'
    case 'dot':
      return 'Router'
    case 'hexagon':
      return 'Host'
    default:
      return 'Node'
  }
}

function shortId(value: string | undefined) {
  return value ? value.slice(0, 12) : ''
}

function isEmulatorNodeObject(value: unknown): value is EmulatorNode {
  const node = value as EmulatorNode | undefined
  return Boolean(node?.meta?.emulatorInfo?.nets && Array.isArray(node.meta.emulatorInfo.nets))
}

function isEmulatorNetworkObject(value: unknown): value is EmulatorNetwork {
  const network = value as EmulatorNetwork | undefined
  return Boolean(network?.meta?.emulatorInfo && 'prefix' in network.meta.emulatorInfo)
}

function searchableObjectText(object: unknown) {
  if (isEmulatorNodeObject(object)) {
    const nodeInfo = object.meta.emulatorInfo
    return [
      object.Id,
      nodeInfo.role,
      nodeInfo.asn === undefined ? undefined : `as${nodeInfo.asn}`,
      nodeInfo.name,
      nodeInfo.displayname,
      nodeInfo.description,
      ...nodeInfo.nets.map((net) => `${net.name} ${net.address}`),
    ].filter(Boolean).join(' ')
  }

  if (isEmulatorNetworkObject(object)) {
    const netInfo = object.meta.emulatorInfo
    return [
      object.Id,
      netInfo.scope === undefined ? undefined : `as${netInfo.scope}`,
      netInfo.name,
      netInfo.prefix,
      netInfo.displayname,
      netInfo.description,
    ].filter(Boolean).join(' ')
  }

  return ''
}

function searchableText(node: GlobeNode) {
  return [
    node.id,
    node.label,
    searchableObjectText(node.object),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchesTopologySearch(node: GlobeNode, keyword: string) {
  const query = keyword.trim().toLowerCase()
  return Boolean(query) && searchableText(node).includes(query)
}

export function findTopologySearchNodeIds(nodes: GlobeNode[], keyword: string) {
  return new Set(
    nodes
      .filter((node) => matchesTopologySearch(node, keyword))
      .map((node) => node.id),
  )
}

export function buildTopologySearchSuggestions(nodes: GlobeNode[], keyword: string) {
  const query = keyword.trim()
  if (!query) return []

  return nodes
    .filter((node) => matchesTopologySearch(node, query))
    .slice(0, MAX_SUGGESTIONS)
    .map<TopologySearchSuggestion>((node) => {
      const type = nodeTypeLabel(node)
      const id = shortId(node.sourceId ?? node.id)
      const group = node.group ? `AS/Scope ${node.group}` : 'No group'
      return {
        value: node.label,
        nodeId: node.id,
        label: node.label,
        type,
        detail: node.searchDetail || `${type} · ${group}${id ? ` · ${id}` : ''}`,
      }
    })
}
