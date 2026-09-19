import type { EmulatorTopologyPacketReplayEvent } from './packetReplayFileService'

export const MIN_REPLAY_TIMER_DELAY_MS = 4
export const MIN_PACKET_VISUAL_DURATION_MS = 16
export const DEFAULT_TIMELINE_WINDOW_MS = 50

export type PacketReplayTimingMode = 'interval' | 'timeline'

export type TimelineReplayBatch = {
  startIndex: number
  endIndex: number
  startMs: number
  endMs: number
  nextStartMs?: number
}

export function getPacketTimestampMs(event: EmulatorTopologyPacketReplayEvent) {
  if (event.timestampNs !== undefined) {
    const timestampNs = Number(event.timestampNs)
    if (Number.isFinite(timestampNs)) return timestampNs / 1_000_000
  }
  return event.timestampMs
}

export function getSpeedAdjustedPacketDurationMs(
  previous: EmulatorTopologyPacketReplayEvent,
  current: EmulatorTopologyPacketReplayEvent,
  speed: number,
) {
  return Math.max(0, getPacketTimestampMs(current) - getPacketTimestampMs(previous))
    / Math.max(0.0001, speed)
}

export function sortPacketReplayEvents(events: EmulatorTopologyPacketReplayEvent[]) {
  const alreadySorted = events.every((event, index) => (
    index === 0 || getPacketTimestampMs(events[index - 1]!) <= getPacketTimestampMs(event)
  ))
  return alreadySorted
    ? events
    : [...events].sort((left, right) => getPacketTimestampMs(left) - getPacketTimestampMs(right))
}

export function buildTimelineReplayBatches(
  events: EmulatorTopologyPacketReplayEvent[],
  windowMs: number,
) {
  const batches: TimelineReplayBatch[] = []
  const safeWindowMs = Math.max(1, windowMs)
  let startIndex = 0
  while (startIndex < events.length) {
    const startMs = getPacketTimestampMs(events[startIndex]!)
    const windowEndMs = startMs + safeWindowMs
    let endIndex = startIndex + 1
    while (endIndex < events.length && getPacketTimestampMs(events[endIndex]!) <= windowEndMs) {
      endIndex += 1
    }
    const endMs = getPacketTimestampMs(events[endIndex - 1]!)
    const nextStartMs = endIndex < events.length ? getPacketTimestampMs(events[endIndex]!) : undefined
    batches.push({ startIndex, endIndex, startMs, endMs, nextStartMs })
    startIndex = endIndex
  }
  return batches
}

export function findTimelineReplayBatchIndex(batches: TimelineReplayBatch[], packetIndex: number) {
  const index = batches.findIndex((batch) => batch.endIndex > packetIndex)
  return index >= 0 ? index : batches.length
}

export function uniquePathNodes(nodeIds: string[]) {
  return nodeIds.filter((nodeId, index) => index === 0 || nodeIds[index - 1] !== nodeId)
}

function makeEndpointKey(ip: string | undefined, port: number | undefined) {
  return `${ip || ''}:${port ?? 0}`
}

function makeObservationPart(...values: Array<string | number | undefined>) {
  return values.map((value) => String(value ?? '').trim()).filter(Boolean).join('/')
}

export function getReplayFlowKey(event: EmulatorTopologyPacketReplayEvent) {
  const protocol = (event.ipProtocol || String(event.ipProtocolNumber ?? '') || 'unknown').toLowerCase()
  const sourceEndpoint = makeEndpointKey(event.sourceIp, event.sourcePort)
  const destEndpoint = makeEndpointKey(event.destIp, event.destPort)
  if (!sourceEndpoint && !destEndpoint) return `${protocol}|${event.containerId}`
  return `${protocol}|${sourceEndpoint}|${destEndpoint}`
}

export function getReplayObservationKey(event: EmulatorTopologyPacketReplayEvent) {
  return [
    getReplayFlowKey(event),
    makeObservationPart(event.containerId, event.containerName, event.nodeName, event.nodeIp, event.nodeLabel),
    makeObservationPart(event.networkId, event.networkName, event.networkLabel, event.ifName),
    event.packetRole,
  ].map((value) => String(value ?? '')).join('|')
}
