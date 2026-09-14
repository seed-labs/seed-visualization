import type { GlobeEdge, GlobeGraph, GlobeNode } from '@/view/map/shared/services/globeGraph'

function addNodeAliases(aliasByNodeId: Map<string, Set<string>>, node: GlobeNode) {
  const aliases = new Set<string>([node.id])
  if (node.sourceId) aliases.add(node.sourceId)
  aliasByNodeId.set(node.id, aliases)
}

function edgeKey(left: string, right: string) {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`
}

function buildPathEdgeKeys(pathNodeIds: string[] | string[][], nodes: GlobeNode[]) {
  const aliasByNodeId = new Map<string, Set<string>>()
  nodes.forEach((node) => addNodeAliases(aliasByNodeId, node))

  const keys = new Set<string>()
  const segments = Array.isArray(pathNodeIds[0])
    ? pathNodeIds as string[][]
    : [pathNodeIds as string[]]

  segments.forEach((segment) => {
    for (let index = 1; index < segment.length; index += 1) {
      const previousAliases = aliasByNodeId.get(segment[index - 1]!) ?? new Set([segment[index - 1]!])
      const currentAliases = aliasByNodeId.get(segment[index]!) ?? new Set([segment[index]!])

      previousAliases.forEach((left) => {
        currentAliases.forEach((right) => {
          keys.add(edgeKey(left, right))
        })
      })
    }
  })

  return keys
}

function edgeMatchesPath(edge: GlobeEdge, pathEdgeKeys: Set<string>) {
  return pathEdgeKeys.has(edgeKey(edge.from, edge.to))
}

export function filterGraphEdgesByPath(graph: GlobeGraph, pathNodeIds: string[] | string[][], enabled: boolean): GlobeGraph {
  if (!enabled) return graph
  const hasPathEdge = Array.isArray(pathNodeIds[0])
    ? (pathNodeIds as string[][]).some((segment) => segment.length >= 2)
    : pathNodeIds.length >= 2
  if (!hasPathEdge) {
    return {
      ...graph,
      edges: [],
    }
  }

  const pathEdgeKeys = buildPathEdgeKeys(pathNodeIds, graph.nodes)
  return {
    ...graph,
    edges: graph.edges.filter((edge) => edgeMatchesPath(edge, pathEdgeKeys)),
  }
}
