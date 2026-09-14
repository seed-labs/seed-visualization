import {
  sortPacketReplayEvents,
  type EmulatorTopologyPacketReplayEvent,
} from './packetReplayFileService'

export type PacketFlowHop = {
  from: string
  to: string
  fromEvent: EmulatorTopologyPacketReplayEvent
  toEvent: EmulatorTopologyPacketReplayEvent
  flowKey: string
}

export type PacketFlowPathStep = {
  nodeId: string
  event: EmulatorTopologyPacketReplayEvent
  flowKey: string
  previousNodeId?: string
}

export type PacketFlowAnalysis = {
  events: EmulatorTopologyPacketReplayEvent[]
  pathEvents: EmulatorTopologyPacketReplayEvent[]
  nodePath: string[]
  pathSegments: string[][]
  pathSteps: PacketFlowPathStep[]
  hops: PacketFlowHop[]
}

export type PacketFlowAnalysisOptions = {
  appendDestinationEndpoint?: boolean
}

export function analyzePacketFlow(
  events: EmulatorTopologyPacketReplayEvent[],
  options: PacketFlowAnalysisOptions = {},
): PacketFlowAnalysis {
  const appendDestinationEndpoint = options.appendDestinationEndpoint ?? true
  const sortedEvents = sortPacketReplayEvents(events)
  const nodePath: string[] = []
  const pathEvents: EmulatorTopologyPacketReplayEvent[] = []
  const pathSteps: PacketFlowPathStep[] = []
  const flowStates = new Map<string, {
    nodePath: string[]
    previousPathEvent?: EmulatorTopologyPacketReplayEvent
    lastEvent?: EmulatorTopologyPacketReplayEvent
  }>()

  sortedEvents.forEach((event) => {
    if (!event.containerId) return
    if (shouldSkipPacketForForwardPath(event)) return

    const flowKey = getPacketFlowKey(event)
    const state = flowStates.get(flowKey) ?? { nodePath: [] }
    flowStates.set(flowKey, state)

    if (!state.previousPathEvent) {
      appendPathNode(state, nodePath, pathEvents, pathSteps, event.sourceContainerId, event, flowKey)
      appendPathNode(state, nodePath, pathEvents, pathSteps, event.networkId, event, flowKey)
      appendPathNode(state, nodePath, pathEvents, pathSteps, event.containerId, event, flowKey)
      state.previousPathEvent = event
      state.lastEvent = event
      return
    }

    if (state.previousPathEvent.networkId) {
      appendPathNode(state, nodePath, pathEvents, pathSteps, state.previousPathEvent.networkId, state.previousPathEvent, flowKey)
    }
    appendPathNode(state, nodePath, pathEvents, pathSteps, event.containerId, event, flowKey)
    state.previousPathEvent = event
    state.lastEvent = event
  })

  if (appendDestinationEndpoint) {
    flowStates.forEach((state, flowKey) => {
      const lastEvent = state.lastEvent
      const destNodeId = lastEvent?.destContainerId
      if (!lastEvent || !destNodeId || state.nodePath.includes(destNodeId)) return

      if (lastEvent.networkId) {
        appendPathNode(state, nodePath, pathEvents, pathSteps, lastEvent.networkId, lastEvent, flowKey)
      }
      appendPathNode(state, nodePath, pathEvents, pathSteps, destNodeId, lastEvent, flowKey)
    })
  }

  const pathSegments = Array.from(flowStates.values())
    .map((state) => state.nodePath)
    .filter((segment) => segment.length > 0)
  const hops = pathSteps
    .filter((step) => step.previousNodeId)
    .map((step): PacketFlowHop => ({
      from: step.previousNodeId!,
      to: step.nodeId,
      fromEvent: step.event,
      toEvent: step.event,
      flowKey: step.flowKey,
    }))

  return {
    events: sortedEvents,
    pathEvents,
    nodePath,
    pathSegments,
    pathSteps,
    hops,
  }
}

function appendPathNode(
  state: { nodePath: string[] },
  nodePath: string[],
  pathEvents: EmulatorTopologyPacketReplayEvent[],
  pathSteps: PacketFlowPathStep[],
  nodeId: string | undefined,
  event: EmulatorTopologyPacketReplayEvent,
  flowKey: string,
) {
  if (!nodeId || state.nodePath[state.nodePath.length - 1] === nodeId) return
  if (state.nodePath.includes(nodeId)) return
  const previousNodeId = state.nodePath[state.nodePath.length - 1]
  state.nodePath.push(nodeId)
  nodePath.push(nodeId)
  pathEvents.push(event)
  pathSteps.push({
    nodeId,
    event,
    flowKey,
    previousNodeId,
  })
}

function shouldSkipPacketForForwardPath(event: EmulatorTopologyPacketReplayEvent) {
  return event.ipProtocol?.toLowerCase() === 'icmp' && event.packetRole?.toLowerCase() === 'reply'
}

function getPacketFlowKey(event: EmulatorTopologyPacketReplayEvent) {
  if (event.flowId) return event.flowId

  const protocol = (event.ipProtocol || String(event.ipProtocolNumber ?? '') || 'unknown').toLowerCase()
  const sourceEndpoint = makeEndpointKey(event.sourceIp, event.sourcePort)
  const destEndpoint = makeEndpointKey(event.destIp, event.destPort)

  if (!sourceEndpoint && !destEndpoint) {
    return `${protocol}|${event.containerId}`
  }

  return `${protocol}|${sourceEndpoint}|${destEndpoint}`
}

function makeEndpointKey(ip: string | undefined, port: number | undefined) {
  return `${ip || ''}:${port ?? 0}`
}
