import type { TrafficPacketMessage } from '@/features/starlink/types';

const DEFAULT_TRAFFIC_OBSERVER_PORT = '19092';
const TRAFFIC_PACKET_WS_PATH = '/ws/packets';
const TRAFFIC_FILTER_PATH = '/filter';
const RECONNECT_DELAY_MS = 1800;

type TrafficPacketHandler = (message: TrafficPacketMessage) => void;
type TrafficErrorHandler = (error: Event) => void;

export type TrafficObserverClient = {
  connect: () => void;
  disconnect: () => void;
};

function createDefaultTrafficObserverUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:${DEFAULT_TRAFFIC_OBSERVER_PORT}${TRAFFIC_PACKET_WS_PATH}`;
}

function normalizeUrlPrefix(value: string | undefined) {
  const prefix = value?.trim();
  if (!prefix) {
    return '';
  }

  return prefix.replace(/\/+$/, '');
}

function createTrafficObserverPath(path: string) {
  const prefix = normalizeUrlPrefix(import.meta.env.VITE_TRAFFIC_OBSERVER_URL_PREFIX);
  if (!prefix) {
    return undefined;
  }

  return `${prefix}${path}`;
}

function createTrafficObserverWebSocketPath(path: string) {
  const httpPath = createTrafficObserverPath(path);
  if (!httpPath) {
    return undefined;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${httpPath}`;
}

function getTrafficObserverUrl() {
  return createTrafficObserverWebSocketPath(TRAFFIC_PACKET_WS_PATH)
    ?? import.meta.env.VITE_TRAFFIC_OBSERVER_WS_URL
    ?? createDefaultTrafficObserverUrl();
}

function createDefaultTrafficObserverHttpUrl() {
  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_TRAFFIC_OBSERVER_PORT}${TRAFFIC_FILTER_PATH}`;
}

function getTrafficObserverFilterUrl() {
  return createTrafficObserverPath(TRAFFIC_FILTER_PATH)
    ?? import.meta.env.VITE_TRAFFIC_OBSERVER_FILTER_URL
    ?? createDefaultTrafficObserverHttpUrl();
}

export async function setTrafficObserverFilter(filter: string) {
  const response = await fetch(getTrafficObserverFilterUrl(), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filter }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.json() as { filter: string };
}

export async function fetchTrafficObserverFilter() {
  const response = await fetch(getTrafficObserverFilterUrl(), {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.json() as { filter: string };
}

function isTrafficPacketMessage(value: unknown): value is TrafficPacketMessage {
  const message = value as TrafficPacketMessage;

  return Boolean(
      message &&
      message.type === 'packet' &&
      typeof message.timestamp === 'string' &&
      (
        message.timestampNs === undefined ||
        typeof message.timestampNs === 'number' ||
        typeof message.timestampNs === 'string'
      ) &&
      typeof message.containerId === 'string' &&
      message.containerId &&
      (
        message.direction === undefined ||
        message.direction === 'ingress' ||
        message.direction === 'egress'
      ) &&
      (message.nodeName === undefined || typeof message.nodeName === 'string') &&
      (message.nodeIp === undefined || typeof message.nodeIp === 'string') &&
      (message.sourceIp === undefined || typeof message.sourceIp === 'string') &&
      (message.destIp === undefined || typeof message.destIp === 'string') &&
      (message.ipProtocol === undefined || typeof message.ipProtocol === 'string') &&
      (message.sourcePort === undefined || typeof message.sourcePort === 'number') &&
      (message.destPort === undefined || typeof message.destPort === 'number') &&
      (message.sourceContainerId === undefined || typeof message.sourceContainerId === 'string') &&
      (message.sourceNodeName === undefined || typeof message.sourceNodeName === 'string') &&
      (message.sourceNodeIp === undefined || typeof message.sourceNodeIp === 'string') &&
      (message.destContainerId === undefined || typeof message.destContainerId === 'string') &&
      (message.destNodeName === undefined || typeof message.destNodeName === 'string') &&
      (message.destNodeIp === undefined || typeof message.destNodeIp === 'string'),
  );
}

export function createTrafficObserverClient(
  onPacket: TrafficPacketHandler,
  onError?: TrafficErrorHandler,
): TrafficObserverClient {
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;
  let closedByUser = false;

  function clearReconnectTimer() {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  }

  function scheduleReconnect() {
    if (closedByUser || reconnectTimer !== undefined) {
      return;
    }

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function connect() {
    if (
      socket &&
      (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    closedByUser = false;
    socket = new WebSocket(getTrafficObserverUrl());

    socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as unknown;
        if (isTrafficPacketMessage(parsed)) {
          onPacket(parsed);
        }
      } catch (error) {
        console.warn('Failed to parse traffic observer packet message.', error);
      }
    });

    socket.addEventListener('error', (event) => {
      onError?.(event);
    });

    socket.addEventListener('close', () => {
      socket = undefined;
      scheduleReconnect();
    });
  }

  function disconnect() {
    closedByUser = true;
    clearReconnectTimer();
    socket?.close();
    socket = undefined;
  }

  return {
    connect,
    disconnect,
  };
}
