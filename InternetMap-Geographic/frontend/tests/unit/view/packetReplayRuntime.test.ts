import { describe, expect, it } from 'vitest'
import type { EmulatorTopologyPacketReplayEvent } from '@/view/map/shared/services/packetReplayFileService'
import {
  buildTimelineReplayBatches,
  findTimelineReplayBatchIndex,
  getPacketTimestampMs,
  sortPacketReplayEvents,
} from '@/view/map/shared/services/packetReplayRuntime'

function packet(timestampMs: number): EmulatorTopologyPacketReplayEvent {
  return { timestampMs } as EmulatorTopologyPacketReplayEvent
}

describe('packet replay runtime', () => {
  it('sorts packets without copying an already sorted list', () => {
    const sorted = [packet(10), packet(20)]
    expect(sortPacketReplayEvents(sorted)).toBe(sorted)
    expect(sortPacketReplayEvents([packet(20), packet(10)]).map(getPacketTimestampMs)).toEqual([10, 20])
  })

  it('builds complete timeline batches and preserves the real inter-batch gap', () => {
    const batches = buildTimelineReplayBatches([
      packet(0),
      packet(20),
      packet(50),
      packet(80),
      packet(200),
    ], 50)

    expect(batches).toEqual([
      { startIndex: 0, endIndex: 3, startMs: 0, endMs: 50, nextStartMs: 80 },
      { startIndex: 3, endIndex: 4, startMs: 80, endMs: 80, nextStartMs: 200 },
      { startIndex: 4, endIndex: 5, startMs: 200, endMs: 200, nextStartMs: undefined },
    ])
    expect(batches[0]!.nextStartMs! - batches[0]!.endMs).toBe(30)
  })

  it('finds the batch following the current packet-axis position', () => {
    const batches = buildTimelineReplayBatches([packet(0), packet(10), packet(100)], 20)
    expect(findTimelineReplayBatchIndex(batches, 0)).toBe(0)
    expect(findTimelineReplayBatchIndex(batches, 2)).toBe(1)
    expect(findTimelineReplayBatchIndex(batches, 3)).toBe(batches.length)
  })
})
