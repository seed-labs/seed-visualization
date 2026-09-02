import type {
  TrafficPacketMessage,
  TrafficPacketReplayEvent,
} from '@/features/starlink/types';

export type TrafficReplaySeekInput = number | number[] | string;

export function createTrafficReplayEvent(message: TrafficPacketMessage): TrafficPacketReplayEvent {
  const timestampMs = normalizePacketTimestamp(message.timestamp);

  return {
    ...message,
    id: `packet:${timestampMs}:${Math.random().toString(36).slice(2, 8)}`,
    timestampMs,
    receivedAtMs: Date.now(),
  };
}

export function compareTrafficReplayEvents(
  left: TrafficPacketReplayEvent,
  right: TrafficPacketReplayEvent,
) {
  const leftTimestampNs = normalizePacketTimestampNs(left.timestampNs);
  const rightTimestampNs = normalizePacketTimestampNs(right.timestampNs);

  if (leftTimestampNs !== undefined && rightTimestampNs !== undefined) {
    if (leftTimestampNs < rightTimestampNs) {
      return -1;
    }
    if (leftTimestampNs > rightTimestampNs) {
      return 1;
    }
  }

  return left.timestampMs - right.timestampMs;
}

export class TrafficReplayPlaylist {
  readonly events: TrafficPacketReplayEvent[];

  constructor(events: TrafficPacketReplayEvent[]) {
    this.events = [...events].sort(compareTrafficReplayEvents);
  }

  get length() {
    return this.events.length;
  }

  get first() {
    return this.events[0];
  }

  get last() {
    return this.events[this.events.length - 1];
  }

  at(index: number) {
    return this.events[index];
  }

  clampIndex(index: number) {
    return Math.min(
      this.events.length - 1,
      Math.max(0, index),
    );
  }

  clampPosition(position: number) {
    return clampTrafficReplaySeekPosition(position, this.events.length);
  }

  static from(events: TrafficPacketReplayEvent[]) {
    return new TrafficReplayPlaylist(events);
  }
}

export function normalizePacketTimestamp(timestamp: string) {
  const timestampMs = Date.parse(timestamp);
  return Number.isFinite(timestampMs) ? timestampMs : Date.now();
}

export function normalizePacketTimestampNs(timestampNs: TrafficPacketMessage['timestampNs']) {
  if (timestampNs === undefined || timestampNs === '') {
    return undefined;
  }

  try {
    return BigInt(timestampNs);
  } catch {
    return undefined;
  }
}

export function normalizeTrafficReplaySeekInput(value: TrafficReplaySeekInput) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const numericValue = Number(rawValue);

  return Number.isFinite(numericValue) ? numericValue : Number.NaN;
}

export function clampTrafficReplaySeekPosition(position: number, maxPosition: number) {
  return Math.min(
    maxPosition,
    Math.max(0, Math.round(position)),
  );
}

export function formatTrafficReplaySeekTooltip(value: number | string, maxPosition: number) {
  const position = normalizeTrafficReplaySeekInput(value);
  return Number.isFinite(position)
    ? String(clampTrafficReplaySeekPosition(position, maxPosition))
    : '0';
}
