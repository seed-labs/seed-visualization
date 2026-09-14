import type { GlobeGraph } from './globeGraph'

// Only highlight changes may reuse geometry. Compare all other fields so a
// refreshed topology, changed metadata, or changed edge never uses stale data.
export function canReuseGraphGeometry(previous: GlobeGraph, next: GlobeGraph): boolean {
  if (previous.nodes.length !== next.nodes.length || previous.edges.length !== next.edges.length) return false
  const sameFields = (left: object, right: object, ignored: string[] = []) => {
    const a = left as Record<string, unknown>
    const b = right as Record<string, unknown>
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every(key => ignored.includes(key) || a[key] === b[key])
  }
  return previous.nodes.every((node, index) => sameFields(node, next.nodes[index]!, ['highlighted', 'searchHighlighted']))
    && previous.edges.every((edge, index) => sameFields(edge, next.edges[index]!))
}
