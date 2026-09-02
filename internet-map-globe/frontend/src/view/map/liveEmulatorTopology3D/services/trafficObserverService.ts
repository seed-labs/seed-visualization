import type { EmulatorTopologyPacketReplayEvent } from '@/view/map/shared/services/packetReplayFileService'

const DEFAULT_TRAFFIC_OBSERVER_PORT = '19092'
const TRAFFIC_PACKET_WS_PATH = '/ws/packets'
const TRAFFIC_FILTER_PATH = '/filter'
const RECONNECT_DELAY_MS = 1800

type TrafficPacketHandler = (message: EmulatorTopologyPacketReplayEvent) => void
type TrafficErrorHandler = (error: Event) => void

function normalizeUrlPrefix(value: string | undefined) {
  const prefix = value?.trim()
  return prefix ? prefix.replace(/\/+$/, '') : ''
}

function normalizeBaseUrl(value: string | undefined) {
  const baseUrl = value?.trim()
  return baseUrl ? baseUrl.replace(/\/+$/, '') : ''
}

function createTrafficObserverPath(path: string) {
  const prefix = normalizeUrlPrefix(import.meta.env.VITE_TRAFFIC_OBSERVER_URL_PREFIX)
  return prefix ? `${prefix}${path}` : undefined
}

function createTrafficObserverWebSocketPath(path: string) {
  const httpPath = createTrafficObserverPath(path)
  if (!httpPath) return undefined
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${httpPath}`
}

function createDefaultTrafficObserverWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.hostname}:${DEFAULT_TRAFFIC_OBSERVER_PORT}${TRAFFIC_PACKET_WS_PATH}`
}

function createTrafficObserverAddressWebSocketUrl(path: string) {
  const address = normalizeBaseUrl(import.meta.env.VITE_TRAFFIC_OBSERVER_ADDRESS)
  if (!address) return undefined
  const url = new URL(path, `${address}/`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function getTrafficObserverWebSocketUrl() {
  return createTrafficObserverWebSocketPath(TRAFFIC_PACKET_WS_PATH)
    ?? import.meta.env.VITE_TRAFFIC_OBSERVER_WS_URL
    ?? createTrafficObserverAddressWebSocketUrl(TRAFFIC_PACKET_WS_PATH)
    ?? createDefaultTrafficObserverWebSocketUrl()
}

function createDefaultTrafficObserverHttpUrl() {
  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_TRAFFIC_OBSERVER_PORT}${TRAFFIC_FILTER_PATH}`
}

function createTrafficObserverAddressHttpUrl(path: string) {
  const address = normalizeBaseUrl(import.meta.env.VITE_TRAFFIC_OBSERVER_ADDRESS)
  return address ? new URL(path, `${address}/`).toString() : undefined
}

function getTrafficObserverFilterUrl() {
  return createTrafficObserverPath(TRAFFIC_FILTER_PATH)
    ?? import.meta.env.VITE_TRAFFIC_OBSERVER_FILTER_URL
    ?? createTrafficObserverAddressHttpUrl(TRAFFIC_FILTER_PATH)
    ?? createDefaultTrafficObserverHttpUrl()
}

export async function setTrafficObserverFilter(filter: string) {
  const response = await fetch(getTrafficObserverFilterUrl(), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filter }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return await response.json() as { filter: string }
}

export async function fetchTrafficObserverFilter() {
  const response = await fetch(getTrafficObserverFilterUrl(), {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return await response.json() as { filter: string }
}

function getTimestampMs(value: Record<string, unknown>) {
  if (
    (typeof value.timestampNs === 'string' && value.timestampNs) ||
    (typeof value.timestampNs === 'number' && Number.isFinite(value.timestampNs))
  ) {
    try {
      return Number(BigInt(value.timestampNs) / 1_000_000n)
    } catch {
      return Number.NaN
    }
  }
  if (typeof value.timestamp === 'string') {
    return Date.parse(value.timestamp)
  }
  return Number.NaN
}

function isPacketMessage(value: unknown): value is Record<string, unknown> {
  const message = value as Record<string, unknown>
  return Boolean(
    message &&
    message.type === 'packet' &&
    typeof message.containerName === 'string' &&
    message.containerName,
  )
}

function toReplayEvent(message: Record<string, unknown>): EmulatorTopologyPacketReplayEvent {
  return {
    timestampMs: getTimestampMs(message),
    timestampNs:
      typeof message.timestampNs === 'string' || typeof message.timestampNs === 'number'
        ? message.timestampNs
        : undefined,
    containerId: typeof message.containerId === 'string' ? message.containerId : '',
    containerName: typeof message.containerName === 'string' ? message.containerName : undefined,
    ifName: typeof message.ifName === 'string' ? message.ifName : undefined,
    nodeLabel: typeof message.nodeLabel === 'string' ? message.nodeLabel : undefined,
    nodeName: typeof message.nodeName === 'string' ? message.nodeName : undefined,
    nodeIp: typeof message.nodeIp === 'string' ? message.nodeIp : undefined,
    networkId: typeof message.networkId === 'string' ? message.networkId : undefined,
    networkName: typeof message.networkName === 'string' ? message.networkName : undefined,
    networkLabel: typeof message.networkLabel === 'string' ? message.networkLabel : undefined,
    sourceIp: typeof message.sourceIp === 'string' ? message.sourceIp : undefined,
    destIp: typeof message.destIp === 'string' ? message.destIp : undefined,
    ipProtocol: typeof message.ipProtocol === 'string' ? message.ipProtocol : undefined,
    flowId: typeof message.flowId === 'string' ? message.flowId : undefined,
    packetId: typeof message.packetId === 'string' ? message.packetId : undefined,
    packetRole: typeof message.packetRole === 'string' ? message.packetRole : undefined,
    packetKind: typeof message.packetKind === 'string' ? message.packetKind : undefined,
    sourceContainerId: typeof message.sourceContainerId === 'string' ? message.sourceContainerId : undefined,
    sourceContainerName: typeof message.sourceContainerName === 'string' ? message.sourceContainerName : undefined,
    sourceNodeName: typeof message.sourceNodeName === 'string' ? message.sourceNodeName : undefined,
    sourceNodeIp: typeof message.sourceNodeIp === 'string' ? message.sourceNodeIp : undefined,
    destContainerId: typeof message.destContainerId === 'string' ? message.destContainerId : undefined,
    destContainerName: typeof message.destContainerName === 'string' ? message.destContainerName : undefined,
    destNodeName: typeof message.destNodeName === 'string' ? message.destNodeName : undefined,
    destNodeIp: typeof message.destNodeIp === 'string' ? message.destNodeIp : undefined,
    sourcePort: typeof message.sourcePort === 'number' ? message.sourcePort : undefined,
    destPort: typeof message.destPort === 'number' ? message.destPort : undefined,
    icmpType: typeof message.icmpType === 'number' ? message.icmpType : undefined,
    icmpCode: typeof message.icmpCode === 'number' ? message.icmpCode : undefined,
    icmpId: typeof message.icmpId === 'number' ? message.icmpId : undefined,
    icmpSeq: typeof message.icmpSeq === 'number' ? message.icmpSeq : undefined,
    tcpSeq: typeof message.tcpSeq === 'number' ? message.tcpSeq : undefined,
    tcpAck: typeof message.tcpAck === 'number' ? message.tcpAck : undefined,
    tcpFlags: typeof message.tcpFlags === 'string' ? message.tcpFlags : undefined,
  }
}

export class TrafficObserverClient {
  private socket?: WebSocket
  private reconnectTimer?: number
  private closedByUser = false
  private readonly onPacket: TrafficPacketHandler
  private readonly onError?: TrafficErrorHandler

  constructor(
    onPacket: TrafficPacketHandler,
    onError?: TrafficErrorHandler,
  ) {
    this.onPacket = onPacket
    this.onError = onError
  }

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)
    ) {
      return
    }

    this.closedByUser = false
    this.socket = new WebSocket(getTrafficObserverWebSocketUrl())

    this.socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as unknown
        if (isPacketMessage(parsed)) {
          const replayEvent = toReplayEvent(parsed)
          console.log('[traffic observer ws] received packet', parsed.nodeLabel)
          this.onPacket(replayEvent)
        }
      } catch (error) {
        console.warn('Failed to parse traffic observer packet message.', error)
      }
    })

    this.socket.addEventListener('error', (event) => {
      this.onError?.(event)
    })

    this.socket.addEventListener('close', () => {
      this.socket = undefined
      this.scheduleReconnect()
    })
  }

  disconnect() {
    this.closedByUser = true
    this.clearReconnectTimer()
    this.socket?.close()
    this.socket = undefined
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== undefined) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer !== undefined) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, RECONNECT_DELAY_MS)
  }
}
