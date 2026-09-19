import {
  analyzePacketFlow,
  type PacketFlowAnalysis,
  type PacketFlowAnalysisOptions,
} from './packetFlowAnalyzer'
import type { EmulatorTopologyPacketReplayEvent } from './packetReplayFileService'

type AnalyzeRequest = {
  id: number
  type: 'analyze'
  events: EmulatorTopologyPacketReplayEvent[]
  options?: PacketFlowAnalysisOptions
}

type SetTopologyRequest = {
  type: 'set-topology'
  edges: Array<{ from: string; to: string }>
}

type WorkerRequest = AnalyzeRequest | SetTopologyRequest

type WorkerResolved = {
  id: number
  type: 'resolved'
  analysis: PacketFlowAnalysis
}

type WorkerUnresolved = {
  id: number
  type: 'unresolved'
  reason: string
}

type WorkerFailure = {
  id: number
  type: 'error'
  error: string
}

export type PacketFlowWorkerResponse = WorkerResolved | WorkerUnresolved | WorkerFailure

let topologyEdges: Array<{ from: string; to: string }> = []

function handleAnalyze(request: AnalyzeRequest): PacketFlowWorkerResponse {
  if (!request.events.length) {
    return {
      id: request.id,
      type: 'unresolved',
      reason: 'No packets to analyze.',
    }
  }

  const analysis = analyzePacketFlow(request.events, {
    ...request.options,
    topologyEdges: request.options?.topologyEdges ?? topologyEdges,
  })
  if (analysis.pathSteps.length === 0 || analysis.pathSegments.length === 0) {
    return {
      id: request.id,
      type: 'unresolved',
      reason: 'Packet flow path could not be resolved from the current packets.',
    }
  }

  return {
    id: request.id,
    type: 'resolved',
    analysis,
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type === 'set-topology') {
    topologyEdges = request.edges
    return
  }
  try {
    postMessage(handleAnalyze(request))
  } catch (error) {
    postMessage({
      id: request.id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerFailure)
  }
}
