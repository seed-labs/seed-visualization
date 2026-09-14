import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

for (const mode of ['globe', '2d']) {
  test(`${mode}: highlights preserve geometry and camera interaction keeps links visible`, async ({ page }) => {
    await page.route('**/satellite-tiles/**', route => route.abort());
    await page.goto('/dev/home');
    const result = await page.evaluate(async mode => {
      const moduleUrl = '/src/view/map/shared/services/cesiumScene.ts';
      const { createMap3DScene } = await import(/* @vite-ignore */ moduleUrl);
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;inset:0';
      document.body.appendChild(container);
      const scene = createMap3DScene(container, { mode });
      try {
        const nodes = [
          { id: 'a', label: 'A', kind: 'star', topologyType: 'ix', lat: 0, lon: 0, height: 0 },
          { id: 'b', label: 'B', kind: 'hexagon', topologyType: 'host', lat: 10, lon: 10, height: 0 },
        ];
        const graph = { nodes, edges: [{ from: 'a', to: 'b' }] };
        scene.renderGraph(graph);
        const lines = scene.viewer.scene.primitives.get(1);
        const line = lines.get(0);
        const positions = line.positions;
        scene.setTopologyVisibility({ ix: true, host: false });
        const visibilityReused = lines.get(0) === line && lines.getGroupShow('host:ix') === false;
        scene.setTopologyVisibility({ ix: true, host: true });
        const visibilityRestored = lines.get(0) === line && lines.getGroupShow('host:ix') === true;
        scene.renderGraph({ ...graph, nodes: nodes.map(node => ({ ...node, highlighted: true, searchHighlighted: true })) });
        const preserved = lines.get(0) === line && lines.get(0).positions === positions;
        scene.renderGraph(graph);
        const cleared = lines.get(0) === line;
        // Reach the interaction threshold without building a huge test topology.
        for (let i = lines.length; i < 4000; i++) lines.add({ positions });
        scene.viewer.camera.moveStart.raiseEvent();
        const visibleDuringInteraction = lines.show;
        scene.renderGraph({ ...graph, nodes: nodes.map(node => ({ ...node, lat: node.lat + 1 })), edges: Array.from({ length: 4000 }, () => ({ from: 'a', to: 'b' })) });
        const visibleAfterUpdate = lines.show && lines.length === 4000;
        scene.viewer.camera.moveEnd.raiseEvent();
        const restored = lines.show;
        scene.renderGraph({ ...graph, nodes: nodes.map(node => ({ ...node, lat: node.lat + 1 })) });
        const rebuilt = lines.get(0) !== line;
        const hopPoints = scene.viewer.scene.primitives.get(3);
        let frames = 0;
        const removeCounter = scene.viewer.scene.postRender.addEventListener(() => frames++);
        scene.animatePacketHop('a', 'b', 300);
        const started = hopPoints.length === 1;
        const deadline = performance.now() + 5000;
        while ((hopPoints.length > 0 || frames < 2) && performance.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        const animationCompleted = started && hopPoints.length === 0 && frames >= 2;
        removeCounter();
        return { visibilityReused, visibilityRestored, preserved, cleared, visibleDuringInteraction, visibleAfterUpdate, restored, rebuilt, animationCompleted };
      } finally {
        scene.destroy();
        container.remove();
      }
    }, mode);
    expect(result).toEqual({ visibilityReused: true, visibilityRestored: true, preserved: true, cleared: true, visibleDuringInteraction: true, visibleAfterUpdate: true, restored: true, rebuilt: true, animationCompleted: true });
  });
}
