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
  topologyEdges?: Array<{ from: string; to: string }>
  compactObservations?: boolean
}

export function analyzePacketFlow(
  events: EmulatorTopologyPacketReplayEvent[],
  options: PacketFlowAnalysisOptions = {},
): PacketFlowAnalysis {
  const analysisEvents = options.compactObservations
    ? compactPacketFlowObservations(events)
    : events
  if (options.topologyEdges?.length) {
    return analyzePacketFlowOnTopology(analysisEvents, options.topologyEdges)
  }
  const appendDestinationEndpoint = options.appendDestinationEndpoint ?? true
  const sortedEvents = sortPacketReplayEvents(analysisEvents)
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
    }
    appendObservedInterface(state, nodePath, pathEvents, pathSteps, event, flowKey)
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

function compactPacketFlowObservations(events: EmulatorTopologyPacketReplayEvent[]) {
  const observations = new Map<string, EmulatorTopologyPacketReplayEvent>()
  events.forEach((event) => {
    const key = [
      getPacketFlowKey(event),
      makeObservationPart(event.containerId, event.containerName, event.nodeName, event.nodeIp, event.nodeLabel),
      makeObservationPart(event.networkId, event.networkName, event.networkLabel, event.ifName),
      event.packetRole,
    ].map((value) => String(value ?? '')).join('|')
    if (!observations.has(key)) observations.set(key, event)
  })
  return [...observations.values()]
}

function makeObservationPart(...values: Array<string | number | undefined>) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('/')
}

function analyzePacketFlowOnTopology(
  events: EmulatorTopologyPacketReplayEvent[],
  topologyEdges: Array<{ from: string; to: string }>,
): PacketFlowAnalysis {
  const sortedEvents = sortPacketReplayEvents(events)
  const flowEvents = new Map<string, EmulatorTopologyPacketReplayEvent[]>()
  sortedEvents.forEach((event) => {
    if (!event.containerId || shouldSkipPacketForForwardPath(event)) return
    const key = getPacketFlowKey(event)
    const current = flowEvents.get(key) ?? []
    current.push(event)
    flowEvents.set(key, current)
  })

  const pathSegments: string[][] = []
  const pathSteps: PacketFlowPathStep[] = []
  const pathEvents: EmulatorTopologyPacketReplayEvent[] = []
  flowEvents.forEach((currentEvents, flowKey) => {
    const endpointEvent = currentEvents.find((event) => event.sourceContainerId && event.destContainerId)
    if (!endpointEvent?.sourceContainerId || !endpointEvent.destContainerId) return
    const observed = new Set(currentEvents.flatMap((event) => [event.containerId, event.networkId].filter(Boolean) as string[]))
    observed.add(endpointEvent.sourceContainerId)
    observed.add(endpointEvent.destContainerId)
    const path = findObservedTopologyPath(
      endpointEvent.sourceContainerId,
      endpointEvent.destContainerId,
      topologyEdges,
      observed,
    )
    if (!path) return

    pathSegments.push(path)
    path.forEach((nodeId, index) => {
      const event = currentEvents.find((item) => item.containerId === nodeId || item.networkId === nodeId) ?? endpointEvent
      pathEvents.push(event)
      pathSteps.push({ nodeId, event, flowKey, previousNodeId: path[index - 1] })
    })
  })

  return {
    events: sortedEvents,
    pathEvents,
    nodePath: pathSegments.flat(),
    pathSegments,
    pathSteps,
    hops: pathSteps.filter((step) => step.previousNodeId).map((step) => ({
      from: step.previousNodeId!,
      to: step.nodeId,
      fromEvent: step.event,
      toEvent: step.event,
      flowKey: step.flowKey,
    })),
  }
}

function findObservedTopologyPath(
  source: string,
  destination: string,
  edges: Array<{ from: string; to: string }>,
  observed: Set<string>,
) {
  const adjacency = new Map<string, string[]>()
  edges.forEach(({ from, to }) => {
    adjacency.set(from, [...(adjacency.get(from) ?? []), to])
    adjacency.set(to, [...(adjacency.get(to) ?? []), from])
  })
  if (!adjacency.has(source) || !adjacency.has(destination)) return undefined

  type Score = { missing: number; hops: number }
  const scores = new Map<string, Score>([[source, { missing: 0, hops: 0 }]])
  const previous = new Map<string, string>()
  const ways = new Map<string, number>([[source, 1]])
  const pending = new Set(adjacency.keys())
  while (pending.size) {
    let current: string | undefined
    pending.forEach((node) => {
      const score = scores.get(node)
      const best = current ? scores.get(current) : undefined
      if (score && (!best || score.missing < best.missing || score.missing === best.missing && score.hops < best.hops)) current = node
    })
    if (!current) break
    pending.delete(current)
    if (current === destination) break
    const currentScore = scores.get(current)!
    for (const next of adjacency.get(current) ?? []) {
      if (!pending.has(next)) continue
      const candidate = { missing: currentScore.missing + (observed.has(next) ? 0 : 1), hops: currentScore.hops + 1 }
      const existing = scores.get(next)
      const better = !existing || candidate.missing < existing.missing || candidate.missing === existing.missing && candidate.hops < existing.hops
      const equal = existing && candidate.missing === existing.missing && candidate.hops === existing.hops
      if (better) {
        scores.set(next, candidate)
        previous.set(next, current)
        ways.set(next, ways.get(current) ?? 1)
      } else if (equal) {
        ways.set(next, Math.min(2, (ways.get(next) ?? 1) + (ways.get(current) ?? 1)))
      }
    }
  }
  if (!scores.has(destination) || ways.get(destination) !== 1) return undefined
  const path = [destination]
  while (path[0] !== source) {
    const parent = previous.get(path[0]!)
    if (!parent) return undefined
    path.unshift(parent)
  }
  return path
}

function appendObservedInterface(
  state: { nodePath: string[] },
  nodePath: string[],
  pathEvents: EmulatorTopologyPacketReplayEvent[],
  pathSteps: PacketFlowPathStep[],
  event: EmulatorTopologyPacketReplayEvent,
  flowKey: string,
) {
  const containerId = event.containerId
  const networkId = event.networkId
  const tail = state.nodePath[state.nodePath.length - 1]
  const hasContainer = state.nodePath.includes(containerId)
  const hasNetwork = Boolean(networkId && state.nodePath.includes(networkId))

  if (tail === containerId || hasContainer && !hasNetwork) {
    appendPathNode(state, nodePath, pathEvents, pathSteps, networkId, event, flowKey)
    return
  }
  if (tail === networkId || hasNetwork && !hasContainer) {
    appendPathNode(state, nodePath, pathEvents, pathSteps, containerId, event, flowKey)
    return
  }

  appendPathNode(state, nodePath, pathEvents, pathSteps, containerId, event, flowKey)
  appendPathNode(state, nodePath, pathEvents, pathSteps, networkId, event, flowKey)
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
