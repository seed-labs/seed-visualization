import type { TrafficPacketMessage } from '@/features/starlink/types';

const DEFAULT_TRAFFIC_OBSERVER_PORT = '19092';
const TRAFFIC_PACKET_WS_PATH = '/ws/packets';
const TRAFFIC_FILTER_PATH = '/filter';
const RECONNECT_DELAY_MS = 1800;

type TrafficPacketHandler = (message: TrafficPacketMessage) => void;
type TrafficErrorHandler = (error: Event) => void;

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
      typeof message.containerName === 'string' &&
      message.containerName &&
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
      (message.sourceContainerName === undefined || typeof message.sourceContainerName === 'string') &&
      (message.sourceContainerId === undefined || typeof message.sourceContainerId === 'string') &&
      (message.sourceNodeName === undefined || typeof message.sourceNodeName === 'string') &&
      (message.sourceNodeIp === undefined || typeof message.sourceNodeIp === 'string') &&
      (message.destContainerName === undefined || typeof message.destContainerName === 'string') &&
      (message.destContainerId === undefined || typeof message.destContainerId === 'string') &&
      (message.destNodeName === undefined || typeof message.destNodeName === 'string') &&
      (message.destNodeIp === undefined || typeof message.destNodeIp === 'string'),
  );
}

export class TrafficObserverClient {
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private closedByUser = false;

  constructor(
    private readonly onPacket: TrafficPacketHandler,
    private readonly onError?: TrafficErrorHandler,
  ) {}

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    this.closedByUser = false;
    this.socket = new WebSocket(getTrafficObserverUrl());

    this.socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as unknown;
        if (isTrafficPacketMessage(parsed)) {
          this.onPacket(parsed);
        }
      } catch (error) {
        console.warn('Failed to parse traffic observer packet message.', error);
      }
    });

    this.socket.addEventListener('error', (event) => {
      this.onError?.(event);
    });

    this.socket.addEventListener('close', () => {
      this.socket = undefined;
      this.scheduleReconnect();
    });
  }

  disconnect() {
    this.closedByUser = true;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = undefined;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== undefined) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer !== undefined) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }
}
