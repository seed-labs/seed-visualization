import { computed, type Ref } from 'vue'
import type { GlobeGraph } from '../services/globeGraph'
import type { EmulatorTopologyPacketReplayEvent } from '../services/packetReplayFileService'
import { getReplayObservationKey, uniquePathNodes } from '../services/packetReplayRuntime'

export function usePacketReplayGraph(baseGraph: Readonly<Ref<GlobeGraph>>) {
  const nodeIdByAlias = computed(() => {
    const aliases = new Map<string, string>()
    baseGraph.value.nodes.forEach((node) => {
      ;[node.id, node.sourceId, node.label].forEach((value) => {
        const key = value?.trim().toLowerCase()
        if (key && !aliases.has(key)) aliases.set(key, node.id)
      })
    })
    return aliases
  })
  const searchEntries = computed(() => baseGraph.value.nodes.map((node) => ({
    id: node.id,
    searchText: node.searchText?.toLowerCase() ?? '',
  })))
  const edgeKeys = computed(() => {
    const keys = new Set<string>()
    baseGraph.value.edges.forEach((edge) => keys.add(makeEdgeKey(edge.from, edge.to)))
    return keys
  })
  const directPathCache = new Map<string, string[]>()

  function resolveGraphNodeId(...candidates: Array<string | undefined>) {
    for (const candidate of candidates) {
      const normalized = candidate?.trim().toLowerCase()
      if (!normalized) continue
      const exact = nodeIdByAlias.value.get(normalized)
      if (exact) return exact
      const searchable = searchEntries.value.find((node) => node.searchText.includes(normalized))
      if (searchable) return searchable.id
    }
    return undefined
  }

  function getPacketDirectPath(event: EmulatorTopologyPacketReplayEvent) {
    const key = getReplayObservationKey(event)
    const cached = directPathCache.get(key)
    if (cached) return cached
    const path = uniquePathNodes([
      resolveGraphNodeId(event.sourceContainerId, event.sourceContainerName, event.sourceNodeName, event.sourceNodeIp, event.sourceIp),
      resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel),
      resolveGraphNodeId(event.destContainerId, event.destContainerName, event.destNodeName, event.destNodeIp, event.destIp),
    ].filter(Boolean) as string[])
    directPathCache.set(key, path)
    return path
  }

  function hasGraphEdge(leftNodeId: string, rightNodeId: string) {
    return edgeKeys.value.has(makeEdgeKey(leftNodeId, rightNodeId))
  }

  function clearPacketDirectPathCache() {
    directPathCache.clear()
  }

  return {
    clearPacketDirectPathCache,
    getPacketDirectPath,
    hasGraphEdge,
    resolveGraphNodeId,
  }
}

function makeEdgeKey(leftNodeId: string, rightNodeId: string) {
  return leftNodeId < rightNodeId
    ? `${leftNodeId}\u0000${rightNodeId}`
    : `${rightNodeId}\u0000${leftNodeId}`
}
