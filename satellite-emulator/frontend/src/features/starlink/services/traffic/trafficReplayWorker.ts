import type { EmulatorContainerInfo } from '@/features/starlink/services/emulatorContainerService';
import {
  filterTrafficReplayEventsByPcap,
  importTrafficReplayFile,
  parseTrafficReplayPcapFile,
  type TrafficReplayPcapPacket,
} from '@/features/starlink/services/traffic/trafficReplayImportService';
import {
  compareTrafficReplayEvents,
} from '@/features/starlink/services/traffic/trafficReplayService';
import type { TrafficPacketReplayEvent } from '@/features/starlink/types';

type ImportRequest = {
  id: number;
  type: 'import';
  jsonFile: File;
  pcapFile?: File;
  containers: EmulatorContainerInfo[];
};

type FilterRequest = {
  id: number;
  type: 'filter';
  jsonEvents: TrafficPacketReplayEvent[];
  pcapPackets: TrafficReplayPcapPacket[];
  filter: string;
};

type WorkerRequest = ImportRequest | FilterRequest;

type WorkerProgress = {
  id: number;
  type: 'progress';
  message: string;
};

type WorkerSuccess = {
  id: number;
  type: 'success';
  result: unknown;
};

type WorkerFailure = {
  id: number;
  type: 'error';
  error: string;
};

type WorkerResponse = WorkerProgress | WorkerSuccess | WorkerFailure;

function postProgress(id: number, message: string) {
  postMessage({
    id,
    type: 'progress',
    message,
  } satisfies WorkerProgress);
}

async function handleImport(request: ImportRequest) {
  postProgress(request.id, 'Reading and parsing collector JSON...');
  const jsonResult = await importTrafficReplayFile(request.jsonFile, request.containers, { sort: false });

  let pcapPackets: TrafficReplayPcapPacket[] = [];
  let pcapSkippedCount = 0;
  if (request.pcapFile) {
    postProgress(request.id, 'Reading and parsing PCAP...');
    const pcapResult = await parseTrafficReplayPcapFile(request.pcapFile);
    pcapPackets = pcapResult.packets;
    pcapSkippedCount = pcapResult.skippedCount;
  }

  postProgress(request.id, 'Sorting packets...');
  return {
    jsonEvents: [...jsonResult.events].sort(compareTrafficReplayEvents),
    events: [...jsonResult.events].sort(compareTrafficReplayEvents),
    pcapPackets,
    jsonSkippedCount: jsonResult.skippedCount,
    jsonRemappedCount: jsonResult.remappedCount,
    pcapSkippedCount,
  };
}

function handleFilter(request: FilterRequest) {
  postProgress(request.id, 'Filtering imported PCAP packets...');
  const result = filterTrafficReplayEventsByPcap(
    request.jsonEvents,
    request.pcapPackets,
    request.filter,
  );

  postProgress(request.id, 'Sorting filtered packets...');
  return {
    ...result,
    events: [...result.events].sort(compareTrafficReplayEvents),
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = request.type === 'import'
      ? await handleImport(request)
      : handleFilter(request);

    postMessage({
      id: request.id,
      type: 'success',
      result,
    } satisfies WorkerSuccess);
  } catch (error) {
    postMessage({
      id: request.id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerFailure);
  }
};

export type TrafficReplayWorkerResponse = WorkerResponse;
