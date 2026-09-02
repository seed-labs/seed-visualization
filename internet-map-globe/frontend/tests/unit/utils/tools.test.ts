import { RouterToListItem, dealTransitWeight, findRouteWithParents, genVisData, getImgUrl } from '@/utils/tools';
import type { RouteRecord } from '@/types';
import type { Vertex } from '@/utils/map-datasource';

describe('route utility helpers', () => {
  const routes: RouteRecord[] = [
    {
      path: '/map',
      meta: { title: 'Map', componentName: 'MapView', icon: 'map' },
      children: [
        {
          path: '/map/3d',
          meta: { title: 'Globe Map', componentName: 'Map3DGlobe', icon: 'globe' },
        },
      ],
    },
  ];

  it('flattens nested router records into menu items', () => {
    expect(RouterToListItem(routes)).toEqual([
      { title: 'Map', name: '/map', content: 'MapView', icon: 'map', type: 'element' },
      { title: 'Globe Map', name: '/map/3d', content: 'Map3DGlobe', icon: 'globe', type: 'element' },
    ]);
  });

  it('finds a route together with its parent chain', () => {
    expect(findRouteWithParents('/map/3d', routes).map((route) => route.path)).toEqual(['/map', '/map/3d']);
    expect(findRouteWithParents('/missing', routes)).toEqual([]);
  });

  it('does not build image URLs outside development mode', () => {
    expect(getImgUrl('/assets/icon.png')).toBe('');
  });
});

describe('compose-to-visualization conversion', () => {
  it('builds seed nodes and networks from docker compose metadata', () => {
    const labels = {
      'org.seedsecuritylabs.seedemu.meta.nodename': 'router0',
      'org.seedsecuritylabs.seedemu.meta.role': 'Router',
      'org.seedsecuritylabs.seedemu.meta.asn': '150',
      'org.seedsecuritylabs.seedemu.meta.net.0.name': 'net0',
      'org.seedsecuritylabs.seedemu.meta.net.0.address': '10.150.0.254/24',
    };

    const result = genVisData(
      {
        networks: {
          net0: {
            ipam: { config: [{ subnet: '10.150.0.0/24' }] },
            labels: {
              'org.seedsecuritylabs.seedemu.meta.name': 'net0',
              'org.seedsecuritylabs.seedemu.meta.scope': '150',
              'org.seedsecuritylabs.seedemu.meta.type': 'local',
            },
          },
        },
        services: {
          router0: {
            image: 'seed-router',
            container_name: 'as150r-router0-10.150.0.254',
            labels,
            networks: {
              net0: { ipv4_address: '10.150.0.254' },
            },
          },
          invalid: {
            container_name: 'not-seed',
            labels: {},
          },
        },
      },
      'output',
    );

    expect(result.nets).toHaveLength(1);
    const network = result.nets[0]!;
    expect(network.Name).toBe('output_net0');
    expect(network.meta.emulatorInfo.name).toBe('net0');
    expect(result.nodes).toHaveLength(1);
    const node = result.nodes[0]!;
    expect(node.Names).toEqual(['/as150r-router0-10.150.0.254']);
    expect(node.meta.emulatorInfo.name).toBe('router0');
    expect(node.meta.emulatorInfo.nets).toEqual([
      { name: 'net0', address: '10.150.0.254/24' },
    ]);
    expect(node.NetworkSettings.Networks.output_net0!.IPAddress).toBe('10.150.0.254');
  });

  it('returns empty data for missing compose content', () => {
    expect(genVisData(undefined as any)).toEqual({ nodes: [], nets: [] });
  });
});

describe('graph weighting helpers', () => {
  it('returns router dots ordered by AS transit density', () => {
    const vertices = [
      { id: 'r1-a', shape: 'dot', group: '1', object: { meta: { emulatorInfo: { name: 'r1' } } } },
      { id: 'r2-a', shape: 'dot', group: '1', object: { meta: { emulatorInfo: { name: 'r2' } } } },
      { id: 'r1-b', shape: 'dot', group: '2', object: { meta: { emulatorInfo: { name: 'r1' } } } },
      { id: 'host', shape: 'dot', group: '3', object: { meta: { emulatorInfo: { name: 'host_0' } } } },
      { id: 'star', shape: 'star', group: '1', object: { meta: { emulatorInfo: { name: 'r3' } } } },
    ] as Vertex[];

    expect(dealTransitWeight(vertices).map((item) => [item.id, item.weight])).toEqual([
      ['r1-a', 2],
      ['r2-a', 2],
      ['r1-b', 1],
    ]);
  });
});
