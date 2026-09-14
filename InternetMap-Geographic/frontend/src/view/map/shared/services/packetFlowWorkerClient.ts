import type {
  PacketFlowAnalysis,
  PacketFlowAnalysisOptions,
} from './packetFlowAnalyzer'
import type { EmulatorTopologyPacketReplayEvent } from './packetReplayFileService'
import type { PacketFlowWorkerResponse } from './packetFlowWorker'

export type PacketFlowWorkerAnalysisResult =
  | {
      status: 'resolved'
      analysis: PacketFlowAnalysis
    }
  | {
      status: 'unresolved'
      reason: string
    }

type PendingRequest = {
  resolve: (value: PacketFlowWorkerAnalysisResult) => void
  timeoutId?: number
}

export class PacketFlowWorkerClient {
  private nextId = 1
  private worker?: Worker
  private readonly pending = new Map<number, PendingRequest>()

  analyze(
    events: EmulatorTopologyPacketReplayEvent[],
    options: PacketFlowAnalysisOptions = {},
    timeoutMs = 500,
  ) {
    if (!events.length) {
      return Promise.resolve({
        status: 'unresolved',
        reason: 'No packets to analyze.',
      } satisfies PacketFlowWorkerAnalysisResult)
    }

    const id = this.nextId
    this.nextId += 1
    const worker = this.ensureWorker()

    return new Promise<PacketFlowWorkerAnalysisResult>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(id)
        resolve({
          status: 'unresolved',
          reason: `Packet flow analysis timed out after ${timeoutMs} ms.`,
        })
      }, timeoutMs)

      this.pending.set(id, { resolve, timeoutId })
      worker.postMessage({
        id,
        type: 'analyze',
        events: toWorkerPlainData(events),
        options,
      })
    })
  }

  terminate() {
    this.pending.forEach((request) => {
      if (request.timeoutId !== undefined) window.clearTimeout(request.timeoutId)
      request.resolve({
        status: 'unresolved',
        reason: 'Packet flow worker was terminated.',
      })
    })
    this.pending.clear()
    this.worker?.terminate()
    this.worker = undefined
  }

  private ensureWorker() {
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('./packetFlowWorker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<PacketFlowWorkerResponse>) => {
      this.handleMessage(event.data)
    }
    this.worker.onerror = (event) => {
      const reason = event.message || 'Packet flow worker failed.'
      this.pending.forEach((request) => {
        if (request.timeoutId !== undefined) window.clearTimeout(request.timeoutId)
        request.resolve({ status: 'unresolved', reason })
      })
      this.pending.clear()
      this.worker?.terminate()
      this.worker = undefined
    }
    return this.worker
  }

  private handleMessage(message: PacketFlowWorkerResponse) {
    const request = this.pending.get(message.id)
    if (!request) return

    this.pending.delete(message.id)
    if (request.timeoutId !== undefined) window.clearTimeout(request.timeoutId)

    if (message.type === 'resolved') {
      request.resolve({
        status: 'resolved',
        analysis: message.analysis,
      })
      return
    }

    request.resolve({
      status: 'unresolved',
      reason: message.type === 'unresolved' ? message.reason : message.error,
    })
  }
}

function toWorkerPlainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
