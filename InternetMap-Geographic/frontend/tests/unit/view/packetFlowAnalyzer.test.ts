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

  test('orders a repeated router between its ingress and egress networks', () => {
    const flowId = 'icmp|10.150.0.71>10.151.0.71|id=7'
    const analysis = analyzePacketFlow([
      packet({ timestampMs: 1, flowId, packetRole: 'request', containerId: 'host-150', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'net-150' }),
      packet({ timestampMs: 2, flowId, packetRole: 'request', containerId: 'router-150', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'net-150' }),
      packet({ timestampMs: 3, flowId, packetRole: 'request', containerId: 'router-150', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'new-york-100' }),
      packet({ timestampMs: 4, flowId, packetRole: 'request', containerId: 'router-3-r100', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'new-york-100' }),
      packet({ timestampMs: 5, flowId, packetRole: 'request', containerId: 'router-3-r100', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'net-100-101' }),
    ], { appendDestinationEndpoint: false })

    expect(analysis.pathSegments).toEqual([[
      'host-150',
      'net-150',
      'router-150',
      'new-york-100',
      'router-3-r100',
      'net-100-101',
    ]])
  })

  test('resolves each directional IP flow through observed topology links', () => {
    const events = [
      packet({ timestampMs: 1, ipProtocol: 'icmp', sourceIp: '10.150.0.71', destIp: '10.151.0.71', containerId: 'host-150', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'net-150' }),
      packet({ timestampMs: 2, ipProtocol: 'icmp', sourceIp: '10.150.0.71', destIp: '10.151.0.71', containerId: 'router-150', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'new-york-100' }),
      packet({ timestampMs: 3, ipProtocol: 'icmp', sourceIp: '10.150.0.71', destIp: '10.151.0.71', containerId: 'router-3-r100', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'net-100-101' }),
      packet({ timestampMs: 4, ipProtocol: 'icmp', sourceIp: '10.150.0.71', destIp: '10.151.0.71', containerId: 'host-151', sourceContainerId: 'host-150', destContainerId: 'host-151', networkId: 'net-151' }),
    ]
    const topologyEdges = [
      ['host-150', 'net-150'], ['net-150', 'router-150'],
      ['router-150', 'new-york-100'], ['new-york-100', 'router-3-r100'],
      ['router-3-r100', 'net-100-101'], ['net-100-101', 'router-3-r101'],
      ['router-3-r101', 'ix-101'], ['ix-101', 'router-151'],
      ['router-151', 'net-151'], ['net-151', 'host-151'],
    ].map(([from, to]) => ({ from: from!, to: to! }))

    expect(analyzePacketFlow(events, { topologyEdges }).pathSegments).toEqual([[
      'host-150', 'net-150', 'router-150', 'new-york-100', 'router-3-r100',
      'net-100-101', 'router-3-r101', 'ix-101', 'router-151', 'net-151', 'host-151',
    ]])
  })
})
