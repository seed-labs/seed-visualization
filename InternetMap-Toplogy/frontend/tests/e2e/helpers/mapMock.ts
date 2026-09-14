import type { Page } from '@playwright/test';
import { mapContainersResponse, mapNetworksResponse } from '../fixtures/map';

export async function mockInternetMapBackends(page: Page) {
  await page.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = MockWebSocket.OPEN;
      url: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        setTimeout(() => {
          const event = new Event('open');
          this.onopen?.(event);
          this.dispatchEvent(event);
        }, 0);
      }

      send() {}

      close() {
        this.readyState = MockWebSocket.CLOSED;
        const event = new CloseEvent('close');
        this.onclose?.(event);
        this.dispatchEvent(event);
      }
    }

    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  await page.route('**/api/v1/container', (route) => route.fulfill({ json: mapContainersResponse }));
  await page.route('**/api/v1/network', (route) => route.fulfill({ json: mapNetworksResponse }));
  await page.route('**/api/v1/sniff', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { ok: true, result: { currentFilter: '' } } });
    }
    return route.fulfill({ json: { ok: true, result: { currentFilter: 'icmp' } } });
  });
  await page.route('**/api/v1/container/*/bgp', (route) => route.fulfill({ json: { ok: true, result: [] } }));
  await page.route('**/api/v1/container/*/net', (route) => route.fulfill({ json: { ok: true, result: true } }));
}
