import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'
import type {
  EmulatorTopologyPcapPacket,
  EmulatorTopologyPacketReplayEvent,
} from './packetReplayFileService'
import type { PacketReplayWorkerResponse } from './packetReplayWorker'

export type PacketReplayWorkerImportResult = {
  jsonEvents: EmulatorTopologyPacketReplayEvent[]
  events: EmulatorTopologyPacketReplayEvent[]
  pcapPackets: EmulatorTopologyPcapPacket[]
  jsonSkippedCount: number
  jsonRemappedCount: number
  pcapSkippedCount: number
}

export type PacketReplayWorkerFilterResult = {
  events: EmulatorTopologyPacketReplayEvent[]
  matchedPacketCount: number
  skippedPacketCount: number
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  onProgress?: (message: string) => void
}

export class PacketReplayWorkerClient {
  private nextId = 1
  private worker?: Worker
  private readonly pending = new Map<number, PendingRequest>()

  importFiles(
    jsonFile: File,
    pcapFile: File | undefined,
    containers: EmulatorNode[],
    networks: EmulatorNetwork[],
    onProgress?: (message: string) => void,
  ) {
    return this.request<PacketReplayWorkerImportResult>({
      type: 'import',
      jsonFile,
      pcapFile,
      containers: toWorkerPlainData(containers),
      networks: toWorkerPlainData(networks),
    }, onProgress)
  }

  filterPackets(
    jsonEvents: EmulatorTopologyPacketReplayEvent[],
    pcapPackets: EmulatorTopologyPcapPacket[],
    filter: string,
    onProgress?: (message: string) => void,
  ) {
    return this.request<PacketReplayWorkerFilterResult>({
      type: 'filter',
      jsonEvents: toWorkerPlainData(jsonEvents),
      pcapPackets: toWorkerPlainData(pcapPackets),
      filter,
    }, onProgress)
  }

  terminate() {
    this.pending.forEach((request) => {
      request.reject(new Error('Packet replay worker was terminated.'))
    })
    this.pending.clear()
    this.worker?.terminate()
    this.worker = undefined
  }

  private request<T>(payload: Record<string, unknown>, onProgress?: (message: string) => void) {
    const id = this.nextId
    this.nextId += 1
    const worker = this.ensureWorker()

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        onProgress,
      })
      worker.postMessage({
        id,
        ...payload,
      })
    })
  }

  private ensureWorker() {
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('./packetReplayWorker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<PacketReplayWorkerResponse>) => {
      this.handleMessage(event.data)
    }
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Packet replay worker failed.')
      this.pending.forEach((request) => request.reject(error))
      this.pending.clear()
    }
    return this.worker
  }

  private handleMessage(message: PacketReplayWorkerResponse) {
    const request = this.pending.get(message.id)
    if (!request) return

    if (message.type === 'progress') {
      request.onProgress?.(message.message)
      return
    }

    this.pending.delete(message.id)
    if (message.type === 'success') {
      request.resolve(message.result)
    } else {
      request.reject(new Error(message.error))
    }
  }
}

function toWorkerPlainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
