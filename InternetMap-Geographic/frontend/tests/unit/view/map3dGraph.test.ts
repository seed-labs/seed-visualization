import { augmentAsHighlight, edgeKey, isTransitRouter } from '@/view/map/shared/services/map3dGraph';
import type { Edge, Vertex } from '@/utils/map-datasource';

describe('globe map graph helpers', () => {
  it('builds stable undirected edge keys', () => {
    expect(edgeKey('a', 'b')).toBe(edgeKey('b', 'a'));
    expect(edgeKey('a', 'b')).not.toBe(edgeKey('a', 'c'));
  });

  it('identifies routers and border routers as transit routers', () => {
    expect(isTransitRouter({ object: { meta: { emulatorInfo: { role: 'Router' } } } })).toBe(true);
    expect(isTransitRouter({ object: { meta: { emulatorInfo: { role: 'BorderRouter' } } } })).toBe(true);
    expect(isTransitRouter({ object: { meta: { emulatorInfo: { role: 'Host' } } } })).toBe(false);
  });

  it('adds AS highlight nodes near visible satellite-connected routers', () => {
    const baseGraph = {
      nodes: [
        { id: 'sat-1', sourceId: 'satellite-source', kind: 'star', lat: 30, lon: 120 },
      ],
      edges: [],
    } as any;
    const vertices = [
      { id: 'satellite-source', shape: 'star' },
      { id: 'router-150', group: '150', object: { meta: { emulatorInfo: { role: 'Router' } } }, label: 'router-150' },
    ] as Vertex[];
    const edges = [
      { from: 'satellite-source', to: 'router-150', label: 'uplink' },
    ] as Edge[];

    const result = augmentAsHighlight(baseGraph, vertices, edges, '150');

    const inferredNode = result.nodes.find((node: any) => node.id.includes('router-150'));
    expect(inferredNode).toBeDefined();
    expect(inferredNode).toMatchObject({
      label: 'router-150',
      highlighted: true,
      sourceId: 'router-150',
      kind: 'dot',
    });
    expect([inferredNode!.lat, inferredNode!.lon]).not.toEqual([30, 120]);
  });
});
