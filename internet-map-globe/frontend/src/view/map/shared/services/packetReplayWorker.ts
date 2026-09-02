import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'
import {
  filterEmulatorTopologyPacketReplayEventsByPcap,
  importEmulatorTopologyPacketReplayFile,
  parseEmulatorTopologyPcapFile,
  sortPacketReplayEvents,
  type EmulatorTopologyPcapPacket,
  type EmulatorTopologyPacketReplayEvent,
} from './packetReplayFileService'

type ImportRequest = {
  id: number
  type: 'import'
  jsonFile: File
  pcapFile?: File
  containers: EmulatorNode[]
  networks: EmulatorNetwork[]
}

type FilterRequest = {
  id: number
  type: 'filter'
  jsonEvents: EmulatorTopologyPacketReplayEvent[]
  pcapPackets: EmulatorTopologyPcapPacket[]
  filter: string
}

type WorkerRequest = ImportRequest | FilterRequest

type WorkerProgress = {
  id: number
  type: 'progress'
  message: string
}

type WorkerSuccess = {
  id: number
  type: 'success'
  result: unknown
}

type WorkerFailure = {
  id: number
  type: 'error'
  error: string
}

type WorkerResponse = WorkerProgress | WorkerSuccess | WorkerFailure

function postProgress(id: number, message: string) {
  postMessage({
    id,
    type: 'progress',
    message,
  } satisfies WorkerProgress)
}

async function handleImport(request: ImportRequest) {
  postProgress(request.id, 'Reading and parsing collector JSON...')
  const jsonResult = await importEmulatorTopologyPacketReplayFile(
    request.jsonFile,
    request.containers,
    request.networks,
    { sort: false },
  )

  let pcapPackets: EmulatorTopologyPcapPacket[] = []
  let pcapSkippedCount = 0
  if (request.pcapFile) {
    postProgress(request.id, 'Reading and parsing PCAP...')
    const pcapResult = await parseEmulatorTopologyPcapFile(request.pcapFile)
    pcapPackets = pcapResult.packets
    pcapSkippedCount = pcapResult.skippedCount
  }

  postProgress(request.id, 'Sorting packets...')
  const sortedEvents = sortPacketReplayEvents(jsonResult.events)

  return {
    jsonEvents: jsonResult.events,
    events: sortedEvents,
    pcapPackets,
    jsonSkippedCount: jsonResult.skippedCount,
    jsonRemappedCount: jsonResult.remappedCount,
    pcapSkippedCount,
  }
}

function handleFilter(request: FilterRequest) {
  postProgress(request.id, 'Filtering imported PCAP packets...')
  const result = filterEmulatorTopologyPacketReplayEventsByPcap(
    request.jsonEvents,
    request.pcapPackets,
    request.filter,
  )

  postProgress(request.id, 'Sorting filtered packets...')
  return {
    ...result,
    events: sortPacketReplayEvents(result.events),
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    const result = request.type === 'import'
      ? await handleImport(request)
      : handleFilter(request)

    postMessage({
      id: request.id,
      type: 'success',
      result,
    } satisfies WorkerSuccess)
  } catch (error) {
    postMessage({
      id: request.id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerFailure)
  }
}

export type PacketReplayWorkerResponse = WorkerResponse
