import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { usePacketReplayPlayback } from '@/view/map/shared/composables/usePacketReplayPlayback'
import type { EmulatorTopologyPacketReplayEvent } from '@/view/map/shared/services/packetReplayFileService'

function packet(timestampMs: number) {
  return { timestampMs } as EmulatorTopologyPacketReplayEvent
}

function createPlayback(events: EmulatorTopologyPacketReplayEvent[]) {
  const state = {
    events: ref(events),
    flowAnimationEnabled: ref(false),
    flowResolved: ref(false),
    index: ref(0),
    intervalMs: ref(100),
    paused: ref(false),
    playing: ref(false),
    preparing: ref(false),
    recording: ref(false),
    timelineCursorMs: ref<number>(),
    timelineSpeed: ref(1),
    timelineWindowMs: ref(50),
    timingMode: ref<'interval' | 'timeline'>('interval'),
  }
  const played: number[] = []
  const batches: Array<[number, number]> = []
  const playback = usePacketReplayPlayback({
    ...state,
    ensureEvents: () => state.events.value,
    getNextDelayMs: () => state.intervalMs.value,
    playBatch: (_events, batch) => batches.push([batch.startIndex, batch.endIndex]),
    playIntervalEvent: (index) => played.push(index),
    playPacket: (index) => played.push(index),
  })
  return { ...state, batches, playback, played }
}

describe('usePacketReplayPlayback', () => {
  afterEach(() => vi.useRealTimers())

  it('advances interval playback with one shared cancellable timer', async () => {
    vi.useFakeTimers()
    const value = createPlayback([packet(0), packet(10)])
    await value.playback.toggle()
    expect(value.played).toEqual([1])
    await vi.advanceTimersByTimeAsync(200)
    expect(value.playing.value).toBe(false)
  })

  it('plays timeline packets as timestamp-window batches', async () => {
    vi.useFakeTimers()
    const value = createPlayback([
      packet(0),
      packet(20),
      packet(100),
    ])
    value.timingMode.value = 'timeline'
    await value.playback.toggle()
    expect(value.batches).toEqual([[0, 2]])
    await vi.advanceTimersByTimeAsync(80)
    expect(value.batches).toEqual([[0, 2], [2, 3]])
  })

  it('waits for flow preparation before interval playback too', async () => {
    let finishPreparation!: (value: boolean) => void
    const preparing = new Promise<boolean>((resolve) => { finishPreparation = resolve })
    const value = createPlayback([packet(0)])
    value.flowAnimationEnabled.value = true
    const preparedPlayback = usePacketReplayPlayback({
      events: value.events,
      flowAnimationEnabled: value.flowAnimationEnabled,
      flowResolved: ref(false),
      index: value.index,
      intervalMs: value.intervalMs,
      paused: value.paused,
      playing: value.playing,
      preparing: value.preparing,
      recording: value.recording,
      timelineCursorMs: value.timelineCursorMs,
      timelineSpeed: value.timelineSpeed,
      timelineWindowMs: value.timelineWindowMs,
      timingMode: value.timingMode,
      ensureEvents: () => value.events.value,
      getNextDelayMs: () => 100,
      playBatch: () => undefined,
      playIntervalEvent: (index) => value.played.push(index),
      playPacket: (index) => value.played.push(index),
      prepareFlow: () => preparing,
    })
    const togglePromise = preparedPlayback.toggle()
    expect(value.played).toEqual([])
    finishPreparation(true)
    await togglePromise
    expect(value.played).toEqual([1])
  })

  it('pauses without advancing, resumes from the next packet, and can restart after completion', async () => {
    vi.useFakeTimers()
    const value = createPlayback([packet(0), packet(10), packet(20)])
    await value.playback.toggle()
    expect(value.played).toEqual([1])
    await value.playback.toggle()
    expect(value.paused.value).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(value.index.value).toBe(1)
    await value.playback.toggle()
    expect(value.played).toEqual([1, 2])
    await vi.advanceTimersByTimeAsync(100)
    expect(value.played).toEqual([1, 2, 3])
    await vi.advanceTimersByTimeAsync(100)
    expect(value.playing.value).toBe(false)
    await value.playback.toggle()
    expect(value.played).toEqual([1, 2, 3, 1])
  })

  it('uses the gap between consecutive timeline batches, not the window size', async () => {
    vi.useFakeTimers()
    const value = createPlayback([packet(0), packet(20), packet(100)])
    value.timingMode.value = 'timeline'
    await value.playback.toggle()
    expect(value.batches).toEqual([[0, 2]])
    await vi.advanceTimersByTimeAsync(79)
    expect(value.batches).toEqual([[0, 2]])
    await vi.advanceTimersByTimeAsync(1)
    expect(value.batches).toEqual([[0, 2], [2, 3]])
    expect(value.index.value).toBe(3)
  })
})
