import type { Locator, Page } from '@playwright/test';
import {
  emulatorContainersResponse,
  plannedShellOrbitResponse,
  starlinkGatewaysResponse,
} from '../fixtures/starlink';

export type StarlinkMockState = {
  trafficFilterRequests: string[];
};

type MockStarlinkBackendOptions = {
  mockCesium?: boolean;
};

export function createStarlinkMockState(): StarlinkMockState {
  return {
    trafficFilterRequests: [],
  };
}

export async function mockStarlinkBackends(
  page: Page,
  state: StarlinkMockState,
  options: MockStarlinkBackendOptions = {},
) {
  await page.addInitScript(({ mockCesium }) => {
    const installDeterministicE2eStyles = () => {
      if (document.getElementById('starlink-e2e-deterministic-styles')) {
        return;
      }

      const style = document.createElement('style');
      style.id = 'starlink-e2e-deterministic-styles';
      style.textContent = `
        *,
        *::before,
        *::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
        }
      `;
      document.head.appendChild(style);
    };

    if (document.head) {
      installDeterministicE2eStyles();
    } else {
      document.addEventListener('DOMContentLoaded', installDeterministicE2eStyles, { once: true });
    }

    const linkUpdateMessage = {
      type: 'SATELLITE_LINK_UPDATES',
      result: [
        {
          timestamp: '1782977606177',
          interval: '1s',
          type: 'satellite',
          links: [
            {
              groundLinks: [
                {
                  satelliteId: '910001',
                  groundStationId: 'starlink-gs-test-001',
                },
              ],
              satelliteLinks: [
                {
                  satelliteAId: '910001',
                  satelliteBId: '910002',
                },
              ],
            },
            {
              groundLinks: [
                {
                  satelliteId: '910002',
                  groundStationId: 'starlink-gs-test-002',
                },
              ],
              satelliteLinks: [],
            },
          ],
        },
      ],
    };

    const trafficSockets = new Set<EventTarget>();

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;

      constructor(url: string | URL) {
        super();
        this.url = String(url);

        if (this.url.includes('/traffic-observer/ws/packets')) {
          trafficSockets.add(this);
        }

        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));

          if (this.url.includes('/satellite/link-updates')) {
            this.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify(linkUpdateMessage),
            }));
          }
        }, 25);
      }

      send() {}

      close() {
        this.readyState = MockWebSocket.CLOSED;
        trafficSockets.delete(this);
        this.dispatchEvent(new CloseEvent('close'));
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: MockWebSocket,
    });

    Object.defineProperty(window, '__starlinkE2e', {
      configurable: true,
      value: {
        sendTrafficPacket(message: unknown) {
          trafficSockets.forEach((socket) => {
            socket.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify(message),
            }));
          });
        },
      },
    });

    if (!mockCesium) {
      return;
    }

    class MockCesiumViewer {
      scene = {
        primitives: {
          add: () => ({
            add: () => ({}),
            removeAll: () => undefined,
          }),
        },
        globe: {},
      };
      camera = {
        flyTo: () => undefined,
        setView: () => undefined,
      };
      entities = {
        add: () => ({}),
        removeAll: () => undefined,
      };
      clock = {};
      destroy = () => undefined;
    }

    const cesiumMock = {
      Viewer: MockCesiumViewer,
      Cartesian3: {
        fromDegrees: () => ({}),
        fromDegreesArrayHeights: () => [],
      },
      Color: {
        fromCssColorString: () => ({
          withAlpha: () => ({}),
        }),
        WHITE: {},
        BLACK: {},
        RED: {},
      },
      PointPrimitiveCollection: class {},
      PolylineCollection: class {},
      LabelCollection: class {},
      VerticalOrigin: { BOTTOM: 1, CENTER: 0 },
      HorizontalOrigin: { CENTER: 0 },
      HeightReference: { NONE: 0 },
      NearFarScalar: class {},
    };

    Object.defineProperty(window, 'Cesium', {
      configurable: true,
      value: cesiumMock,
    });
  }, { mockCesium: options.mockCesium ?? true });

  await page.route('**/api/v1/satellite/planned-shell-orbit', route => route.fulfill({
    json: plannedShellOrbitResponse,
  }));
  await page.route('**/api/v1/satellite/starlink-gateways', route => route.fulfill({
    json: starlinkGatewaysResponse,
  }));
  await page.route('**/api/v1/satellite/links', route => route.fulfill({
    json: {
      ok: true,
      path: '/mock/links.json',
    },
  }));
  await page.route('**/emulator/api/v1/container', route => route.fulfill({
    json: emulatorContainersResponse,
  }));
  await page.route('**/traffic-observer/filter', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { filter: '' } });
      return;
    }

    const body = route.request().postDataJSON() as { filter?: string } | undefined;
    state.trafficFilterRequests.push(body?.filter ?? '');
    await route.fulfill({ json: { filter: body?.filter ?? '' } });
  });
  await page.route('**/satellite-tiles/**', route => route.fulfill({
    status: 204,
    body: '',
  }));
}

export async function sendTrafficPacket(page: Page, index: number, overrides = {}) {
  await page.evaluate(
    ({ index: packetIndex, overrides: packetOverrides }) => {
      const message = {
        type: 'packet',
        sequence: packetIndex,
        timestamp: `2026-07-15T06:34:${String(38 + packetIndex).padStart(2, '0')}.000000000Z`,
        timestampNs: String(1_784_096_078_000_000_000n + BigInt(packetIndex)),
        containerName: packetIndex % 2
          ? 'as150brd-router0-10.150.0.254'
          : 'as150h-host_0-10.150.0.71',
        containerId: packetIndex % 2
          ? 'container-router-1234567890'
          : 'container-alpha-1234567890',
        nodeName: packetIndex % 2 ? 'router0' : 'host_0',
        nodeIp: packetIndex % 2 ? '10.150.0.254' : '10.150.0.71',
        direction: 'ingress',
        sourceIp: '10.150.0.71',
        destIp: '10.151.0.71',
        ipProtocol: 'icmp',
        ...packetOverrides,
      };

      (window as unknown as {
        __starlinkE2e: {
          sendTrafficPacket: (value: unknown) => void;
        };
      }).__starlinkE2e.sendTrafficPacket(message);
    },
    { index, overrides },
  );
}

export async function openDockPage(page: Page, pageLabel: string | RegExp) {
  await e2eClick(page.locator('.dock-menu-button'));
  await e2eClick(page.getByRole('button', { name: pageLabel }));
}

export async function e2eClick(locator: Locator) {
  await locator.waitFor({ state: 'attached', timeout: 10_000 });
  await locator.evaluate((element) => {
    (element as HTMLElement).click();
  });
}
