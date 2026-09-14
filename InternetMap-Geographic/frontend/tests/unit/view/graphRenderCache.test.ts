import { describe, expect, it } from 'vitest'
import { canReuseGraphGeometry } from '@/view/map/shared/services/graphRenderCache'
import type { GlobeGraph } from '@/view/map/shared/services/globeGraph'

const graph = (): GlobeGraph => ({
  nodes: [
    { id: 'a', label: 'A', lat: 0, lon: 0, height: 0, kind: 'dot' },
    { id: 'b', label: 'B', lat: 10, lon: 10, height: 0, kind: 'hexagon' },
  ],
  edges: [{ from: 'a', to: 'b' }],
})

describe('graph geometry cache invalidation', () => {
  it('reuses geometry when selecting, searching, and clearing highlights', () => {
    const previous = graph()
    const selected = graph()
    selected.nodes[0]!.highlighted = true
    selected.nodes[1]!.searchHighlighted = true
    expect(canReuseGraphGeometry(previous, selected)).toBe(true)
    expect(canReuseGraphGeometry(selected, previous)).toBe(true)
  })

  it('invalidates moved nodes, changed metadata, and router expansion data', () => {
    for (const patch of [{ lat: 5 }, { label: 'new' }, { object: {} }, { parentId: 'router' }]) {
      const next = graph()
      Object.assign(next.nodes[0]!, patch)
      expect(canReuseGraphGeometry(graph(), next)).toBe(false)
    }
  })

  it('invalidates filtering, reordered nodes, and changed edge properties', () => {
    const filtered = graph()
    filtered.nodes.pop()
    expect(canReuseGraphGeometry(graph(), filtered)).toBe(false)
    const reordered = graph()
    reordered.nodes.reverse()
    expect(canReuseGraphGeometry(graph(), reordered)).toBe(false)
    const edges = graph()
    edges.edges[0]!.surfaceCurve = true
    expect(canReuseGraphGeometry(graph(), edges)).toBe(false)
    edges.edges = []
    expect(canReuseGraphGeometry(graph(), edges)).toBe(false)
  })
})
