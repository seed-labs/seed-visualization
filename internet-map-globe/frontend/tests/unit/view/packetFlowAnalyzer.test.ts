import { describe, expect, test } from 'vitest'

import { analyzePacketFlow } from '@/view/map/shared/services/packetFlowAnalyzer'
import type { EmulatorTopologyPacketReplayEvent } from '@/view/map/shared/services/packetReplayFileService'

function packet(partial: Partial<EmulatorTopologyPacketReplayEvent>): EmulatorTopologyPacketReplayEvent {
  return {
    timestampMs: 0,
    containerId: '',
    ...partial,
  }
}

describe('packet flow analyzer', () => {
  test('builds the forward ICMP path and skips replies', () => {
    const flowId = 'icmp|10.162.0.71:0|10.170.0.71:0|id=7'
    const analysis = analyzePacketFlow([
      packet({
        timestampMs: 1,
        flowId,
        packetRole: 'request',
        containerId: 'host-170',
        sourceContainerId: 'host-170',
        destContainerId: 'host-162',
        networkId: 'net-170',
      }),
      packet({
        timestampMs: 2,
        flowId,
        packetRole: 'request',
        containerId: 'router-170',
        sourceContainerId: 'host-170',
        destContainerId: 'host-162',
        networkId: 'ix-105',
      }),
      packet({
        timestampMs: 3,
        flowId,
        packetRole: 'request',
        containerId: 'router-3-105',
        sourceContainerId: 'host-170',
        destContainerId: 'host-162',
        networkId: 'transit-103-105',
      }),
      packet({
        timestampMs: 4,
        flowId,
        packetRole: 'request',
        containerId: 'router-3-103',
        sourceContainerId: 'host-170',
        destContainerId: 'host-162',
        networkId: 'ix-103',
      }),
      packet({
        timestampMs: 5,
        flowId,
        packetRole: 'request',
        containerId: 'router-162',
        sourceContainerId: 'host-170',
        destContainerId: 'host-162',
        networkId: 'net-162',
      }),
      packet({
        timestampMs: 6,
        flowId,
        packetRole: 'reply',
        containerId: 'host-162',
        sourceContainerId: 'host-162',
        destContainerId: 'host-170',
        networkId: 'net-162',
      }),
    ])

    expect(analysis.pathSegments).toEqual([[
      'host-170',
      'net-170',
      'router-170',
      'ix-105',
      'router-3-105',
      'transit-103-105',
      'router-3-103',
      'ix-103',
      'router-162',
      'net-162',
      'host-162',
    ]])
  })

  test('does not append the same live flow path again for repeated packets', () => {
    const flowId = 'icmp|10.162.0.71:0|10.170.0.71:0|id=7'
    const firstPing = [
      packet({
        timestampMs: 1,
        flowId,
        packetRole: 'request',
        containerId: 'host-170',
        sourceContainerId: 'host-170',
        destContainerId: 'host-162',
        networkId: 'net-170',
      }),
      packet({
        timestampMs: 2,
        flowId,
        packetRole: 'request',
        containerId: 'router-170',
        sourceContainerId: 'host-170',
        destContainerId: 'host-162',
        networkId: 'net-162',
      }),
    ]
    const secondPing = firstPing.map((event, index) => ({
      ...event,
      timestampMs: index + 10,
      packetId: `seq-2-${index}`,
    }))

    const analysis = analyzePacketFlow([...firstPing, ...secondPing])

    expect(analysis.pathSegments).toEqual([[
      'host-170',
      'net-170',
      'router-170',
      'net-162',
      'host-162',
    ]])
  })
})
