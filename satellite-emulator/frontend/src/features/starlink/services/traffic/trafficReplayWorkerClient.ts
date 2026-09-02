import type { EmulatorContainerInfo } from '@/features/starlink/services/emulatorContainerService';
import type {
  TrafficReplayPcapPacket,
} from '@/features/starlink/services/traffic/trafficReplayImportService';
import type { TrafficPacketReplayEvent } from '@/features/starlink/types';
import type { TrafficReplayWorkerResponse } from './trafficReplayWorker';

export type TrafficReplayWorkerImportResult = {
  jsonEvents: TrafficPacketReplayEvent[];
  events: TrafficPacketReplayEvent[];
  pcapPackets: TrafficReplayPcapPacket[];
  jsonSkippedCount: number;
  jsonRemappedCount: number;
  pcapSkippedCount: number;
};

export type TrafficReplayWorkerFilterResult = {
  events: TrafficPacketReplayEvent[];
  matchedPacketCount: number;
  skippedPacketCount: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (message: string) => void;
};

export class TrafficReplayWorkerClient {
  private nextId = 1;
  private worker?: Worker;
  private readonly pending = new Map<number, PendingRequest>();

  importFiles(
    jsonFile: File,
    pcapFile: File | undefined,
    containers: EmulatorContainerInfo[],
    onProgress?: (message: string) => void,
  ) {
    return this.request<TrafficReplayWorkerImportResult>({
      type: 'import',
      jsonFile,
      pcapFile,
      containers: toWorkerPlainData(containers),
    }, onProgress);
  }

  filterPackets(
    jsonEvents: TrafficPacketReplayEvent[],
    pcapPackets: TrafficReplayPcapPacket[],
    filter: string,
    onProgress?: (message: string) => void,
  ) {
    return this.request<TrafficReplayWorkerFilterResult>({
      type: 'filter',
      jsonEvents: toWorkerPlainData(jsonEvents),
      pcapPackets: toWorkerPlainData(pcapPackets),
      filter,
    }, onProgress);
  }

  terminate() {
    this.pending.forEach((request) => {
      request.reject(new Error('Traffic replay worker was terminated.'));
    });
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined;
  }

  private request<T>(payload: Record<string, unknown>, onProgress?: (message: string) => void) {
    const id = this.nextId;
    this.nextId += 1;
    const worker = this.ensureWorker();

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        onProgress,
      });
      worker.postMessage({
        id,
        ...payload,
      });
    });
  }

  private ensureWorker() {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./trafficReplayWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<TrafficReplayWorkerResponse>) => {
      this.handleMessage(event.data);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Traffic replay worker failed.');
      this.pending.forEach((request) => request.reject(error));
      this.pending.clear();
    };
    return this.worker;
  }

  private handleMessage(message: TrafficReplayWorkerResponse) {
    const request = this.pending.get(message.id);
    if (!request) return;

    if (message.type === 'progress') {
      request.onProgress?.(message.message);
      return;
    }

    this.pending.delete(message.id);
    if (message.type === 'success') {
      request.resolve(message.result);
    } else {
      request.reject(new Error(message.error));
    }
  }
}

function toWorkerPlainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
