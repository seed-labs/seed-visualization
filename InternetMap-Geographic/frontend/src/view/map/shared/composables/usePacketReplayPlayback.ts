import type { Ref } from 'vue'
import type { EmulatorTopologyPacketReplayEvent } from '../services/packetReplayFileService'
import {
  buildTimelineReplayBatches,
  findTimelineReplayBatchIndex,
  getPacketTimestampMs,
  MIN_PACKET_VISUAL_DURATION_MS,
  MIN_REPLAY_TIMER_DELAY_MS,
  type PacketReplayTimingMode,
  type TimelineReplayBatch,
} from '../services/packetReplayRuntime'
import { usePacketReplayScheduler } from './usePacketReplayScheduler'

type PacketReplayPlaybackOptions = {
  events: Ref<EmulatorTopologyPacketReplayEvent[]>
  flowAnimationEnabled: Ref<boolean>
  flowResolved: Ref<boolean>
  index: Ref<number>
  intervalMs: Ref<number>
  paused: Ref<boolean>
  playing: Ref<boolean>
  preparing: Ref<boolean>
  recording: Ref<boolean>
  timelineCursorMs: Ref<number | undefined>
  timelineSpeed: Ref<number>
  timelineWindowMs: Ref<number>
  timingMode: Ref<PacketReplayTimingMode>
  ensureEvents: () => EmulatorTopologyPacketReplayEvent[]
  getNextDelayMs: (position: number) => number
  playBatch: (events: EmulatorTopologyPacketReplayEvent[], batch: TimelineReplayBatch, durationMs: number) => void
  playIntervalEvent: (position: number) => void
  playPacket: (position: number) => void
  prepareFlow?: () => Promise<boolean>
}

export function usePacketReplayPlayback(options: PacketReplayPlaybackOptions) {
  let batches: TimelineReplayBatch[] = []
  let batchIndex = 0
  const scheduler = usePacketReplayScheduler(options.playing)

  const isTimelineSpeedMode = () => options.timingMode.value === 'timeline' && options.timelineWindowMs.value <= 0

  function rebuildTimelineBatches(events: EmulatorTopologyPacketReplayEvent[]) {
    batches = buildTimelineReplayBatches(events, options.timelineWindowMs.value)
    batchIndex = findTimelineReplayBatchIndex(batches, options.index.value)
  }

  function show(index: number) {
    const events = options.timingMode.value === 'timeline' ? options.ensureEvents() : options.events.value
    if (!events.length) return
    options.index.value = Math.max(0, Math.min(events.length, Math.round(index)))
    if (options.timingMode.value === 'timeline') {
      if (!isTimelineSpeedMode()) rebuildTimelineBatches(events)
      options.timelineCursorMs.value = events[options.index.value]
        ? getPacketTimestampMs(events[options.index.value]!)
        : undefined
      options.playPacket(options.index.value)
      return
    }
    options.playIntervalEvent(options.index.value)
  }

  function jump(direction: number) {
    show(options.index.value + direction)
  }

  function finish() {
    options.playing.value = false
    options.paused.value = false
    options.timelineCursorMs.value = undefined
  }

  function playNextWindow() {
    const events = options.events.value
    const batch = batches[batchIndex]
    if (!events.length || !batch) {
      finish()
      return
    }
    const speed = Math.max(0.0001, options.timelineSpeed.value)
    const durationMs = Math.max(MIN_PACKET_VISUAL_DURATION_MS, (batch.endMs - batch.startMs) / speed)
    options.playBatch(events, batch, durationMs)
    options.index.value = batch.endIndex
    batchIndex += 1
    options.timelineCursorMs.value = batch.nextStartMs
    scheduler.scheduleNext(playNext, Math.max(
      MIN_REPLAY_TIMER_DELAY_MS,
      batch.nextStartMs === undefined ? durationMs : (batch.nextStartMs - batch.endMs) / speed,
    ))
  }

  function playNext() {
    if (!options.playing.value) return
    if (options.timingMode.value === 'timeline' && !isTimelineSpeedMode()) {
      playNextWindow()
      return
    }
    const events = options.events.value
    if (!events.length || options.index.value >= events.length) {
      finish()
      return
    }
    options.index.value += 1
    if (options.timingMode.value === 'interval') options.playIntervalEvent(options.index.value)
    else options.playPacket(options.index.value)
    scheduler.scheduleNext(playNext, Math.max(0, options.getNextDelayMs(options.index.value)))
  }

  async function toggle() {
    if (options.recording.value || options.preparing.value) return
    if (options.playing.value) {
      options.playing.value = false
      options.paused.value = true
      scheduler.cancel()
      return
    }
    if (
      options.flowAnimationEnabled.value &&
      options.events.value.length > 0 && !options.flowResolved.value && options.prepareFlow
    ) {
      if (!await options.prepareFlow()) return
    }
    const events = options.timingMode.value === 'timeline' ? options.ensureEvents() : options.events.value
    if (!events.length) return
    scheduler.cancel()
    if (options.index.value >= events.length) options.index.value = 0
    if (options.timingMode.value === 'timeline' && !isTimelineSpeedMode()) rebuildTimelineBatches(events)
    options.timelineCursorMs.value = undefined
    options.paused.value = false
    options.playing.value = true
    playNext()
  }

  function reset() {
    scheduler.cancel()
    batches = []
    batchIndex = 0
  }

  return {
    cancel: scheduler.cancel,
    isTimelineSpeedMode,
    jump,
    playNext,
    reset,
    schedule: scheduler.schedule,
    show,
    toggle,
  }
}
