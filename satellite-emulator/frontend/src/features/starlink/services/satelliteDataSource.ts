import { appConfig } from '@/config/env';
import type {
  GroundLinkState,
  InterSatelliteLink,
  LinksRequest,
  LinkUpdateState,
  NetworkLinkFrame,
  NetworkLinksRequest,
  NetworkNodeRef,
  NetworkPathUpdateState,
  SatelliteGroundLink,
  SatelliteGroundLinkFrame,
  SatelliteLinkFrame,
  SatelliteLinksRequest,
} from '@/features/starlink/types';

export type SatelliteDataEvent = 'ground-links' | 'satellite-links' | 'network-links' | 'dead';

type LinkUpdatesMessage = {
  type: 'SATELLITE_LINK_UPDATES';
  result: LinksRequest | LinksRequest[];
};

type LinkUpdatePlaybackFrame = {
  update: LinkUpdateState | NetworkPathUpdateState;
  requestType: 'satellite' | 'network';
  startTimeMs: number;
  endTimeMs: number;
  requestIndex: number;
  groupIndex: number;
};

function getWebSocketHost() {
  if (import.meta.env.MODE === 'development' && import.meta.env.VITE_PROXY_ADDRESS) {
    return import.meta.env.VITE_PROXY_ADDRESS.replace(/^https?:\/\//, '');
  }

  return location.host;
}

function getWebSocketProtocol() {
  return location.protocol === 'https:' ? 'wss' : 'ws';
}

function isGroundLinkState(value: unknown): value is GroundLinkState {
  const link = value as GroundLinkState;

  return Boolean(
    link &&
      typeof link.groundStationId === 'string' &&
      typeof link.satelliteId === 'string',
  );
}

function isInterSatelliteLink(value: unknown): value is InterSatelliteLink {
  const link = value as InterSatelliteLink;

  return Boolean(
    link &&
      typeof link.satelliteAId === 'string' &&
      typeof link.satelliteBId === 'string',
  );
}

function isLinkUpdateState(value: unknown): value is LinkUpdateState {
  const update = value as LinkUpdateState;

  return Boolean(
    update &&
      Array.isArray(update.groundLinks) &&
      update.groundLinks.every(isGroundLinkState) &&
      Array.isArray(update.satelliteLinks) &&
      update.satelliteLinks.every(isInterSatelliteLink),
  );
}

function isNetworkNodeRef(value: unknown): value is NetworkNodeRef {
  const node = value as NetworkNodeRef;

  return Boolean(
    node &&
      typeof node.id === 'string' &&
      typeof node.type === 'string' &&
      (node.latencyMs === undefined || typeof node.latencyMs === 'number') &&
      (node.packetLoss === undefined || typeof node.packetLoss === 'number'),
  );
}

function isNetworkPathUpdateState(value: unknown): value is NetworkPathUpdateState {
  const update = value as NetworkPathUpdateState;

  return Boolean(
    update &&
      (update.id === undefined || typeof update.id === 'string') &&
      Array.isArray(update.forwardPath) &&
      update.forwardPath.every(isNetworkNodeRef) &&
      Array.isArray(update.returnPath) &&
      update.returnPath.every(isNetworkNodeRef),
  );
}

function hasValidTimelineFields(value: unknown): value is { interval: string; timestamp: string } {
  const request = value as { interval: string; timestamp: string };

  return Boolean(
    request &&
      typeof request.interval === 'string' &&
      typeof request.timestamp === 'string',
  );
}

function isSatelliteLinksRequest(value: unknown): value is SatelliteLinksRequest {
  const request = value as SatelliteLinksRequest;

  return Boolean(
    hasValidTimelineFields(request) &&
      (request.type === undefined || request.type === 'satellite') &&
      Array.isArray(request.links) &&
      request.links.every(isLinkUpdateState),
  );
}

function isNetworkLinksRequest(value: unknown): value is NetworkLinksRequest {
  const request = value as NetworkLinksRequest;

  return Boolean(
    hasValidTimelineFields(request) &&
      request.type === 'network' &&
      Array.isArray(request.links) &&
      request.links.every(isNetworkPathUpdateState),
  );
}

function isLinksRequest(value: unknown): value is LinksRequest {
  return isSatelliteLinksRequest(value) || isNetworkLinksRequest(value);
}

function isLinkUpdatesMessage(value: unknown): value is LinkUpdatesMessage {
  const message = value as LinkUpdatesMessage;

  return Boolean(
    message &&
      message.type === 'SATELLITE_LINK_UPDATES' &&
      (isLinksRequest(message.result) ||
        (Array.isArray(message.result) && message.result.every(isLinksRequest))),
  );
}

function parseMilliseconds(value: string) {
  const trimmedValue = value.trim().toLowerCase();
  const milliseconds = trimmedValue.endsWith('ms')
    ? Number(trimmedValue.slice(0, -2))
    : trimmedValue.endsWith('s')
      ? Number(trimmedValue.slice(0, -1)) * 1000
      : Number(trimmedValue);

  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
}

function parseTimestamp(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return undefined;
  }

  const numericValue = Number(trimmedValue);
  if (Number.isFinite(numericValue)) {
    const milliseconds = Math.abs(numericValue) >= 1_000_000_000_000
      ? numericValue
      : numericValue * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }

  const milliseconds = Date.parse(trimmedValue);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function toSatelliteGroundLinks(links: GroundLinkState[]): SatelliteGroundLink[] {
  return links.map((link) => ({
    satelliteId: link.satelliteId,
    stationId: link.groundStationId,
    distanceKm: 0,
  }));
}

export class SatelliteDataSource {
  private _socket?: WebSocket;
  private _connected = false;
  private _playbackFrames: LinkUpdatePlaybackFrame[] = [];
  private _activeFrameIndex = -1;
  private _timelineCompleted = true;
  private _groundLinksEventHandler: (data: SatelliteGroundLinkFrame) => void = () => undefined;
  private _satelliteLinksEventHandler: (data: SatelliteLinkFrame) => void = () => undefined;
  private _networkLinksEventHandler: (data: NetworkLinkFrame) => void = () => undefined;
  private _errorHandler: (error: Event | CloseEvent | unknown) => void = () => undefined;

  constructor(
    private readonly _getSimulationTime: () => Date,
    private readonly _synchronizeSimulationTime: (time: Date) => void,
  ) {}

  connect() {
    if (this._connected) {
      return;
    }

    const host = getWebSocketHost();
    const protocol = getWebSocketProtocol();
    this._socket = new WebSocket(
      `${protocol}://${host}${appConfig.api.basePath}/satellite/link-updates`,
    );

    this._socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data.toString());
        if (isLinkUpdatesMessage(message)) {
          const requests = Array.isArray(message.result) ? message.result : [message.result];
          this.scheduleLinkUpdates(requests);
        }
      } catch (error) {
        this._errorHandler(error);
      }
    });

    this._socket.addEventListener('error', (event) => {
      this._errorHandler(event);
    });

    this._socket.addEventListener('close', (event) => {
      this._connected = false;
      this._errorHandler(event);
    });

    this._connected = true;
  }

  disconnect() {
    this._connected = false;
    this.clearTimeline();
    this._socket?.close();
    this._socket = undefined;
  }

  on(eventName: 'ground-links', callback: (data: SatelliteGroundLinkFrame) => void): void;
  on(eventName: 'satellite-links', callback: (data: SatelliteLinkFrame) => void): void;
  on(eventName: 'network-links', callback: (data: NetworkLinkFrame) => void): void;
  on(eventName: 'dead', callback: (data: unknown) => void): void;
  on(eventName: SatelliteDataEvent, callback: (data: any) => void = () => undefined) {
    switch (eventName) {
      case 'ground-links':
        this._groundLinksEventHandler = callback as (data: SatelliteGroundLinkFrame) => void;
        break;
      case 'satellite-links':
        this._satelliteLinksEventHandler = callback as (data: SatelliteLinkFrame) => void;
        break;
      case 'network-links':
        this._networkLinksEventHandler = callback as (data: NetworkLinkFrame) => void;
        break;
      case 'dead':
        this._errorHandler = callback;
        break;
    }
  }

  advanceTo(simulationTime: Date) {
    if (!this._playbackFrames.length) {
      return;
    }

    const simulationTimeMs = simulationTime.getTime();
    let activeFrameIndex = -1;
    for (let index = 0; index < this._playbackFrames.length; index += 1) {
      const frame = this._playbackFrames[index];
      if (simulationTimeMs >= frame.startTimeMs && simulationTimeMs < frame.endTimeMs) {
        activeFrameIndex = index;
      }
    }

    if (activeFrameIndex >= 0) {
      this._timelineCompleted = false;
      if (activeFrameIndex !== this._activeFrameIndex) {
        this._activeFrameIndex = activeFrameIndex;
        this.emitFrame(this._playbackFrames[activeFrameIndex]);
      }
      return;
    }

    const finalFrame = this._playbackFrames[this._playbackFrames.length - 1];
    if (simulationTimeMs >= finalFrame.endTimeMs) {
      if (!this._timelineCompleted) {
        this._timelineCompleted = true;
        this._activeFrameIndex = -1;
        this.emitLinksCompleted(new Date(finalFrame.endTimeMs));
      }
      return;
    }

    if (this._activeFrameIndex !== -1 || this._timelineCompleted) {
      this._timelineCompleted = false;
      this._activeFrameIndex = -1;
      this.emitEmptyFrame(simulationTime);
    }
  }

  private clearTimeline() {
    this._playbackFrames = [];
    this._activeFrameIndex = -1;
    this._timelineCompleted = true;
  }

  private scheduleLinkUpdates(requests: LinksRequest[]) {
    const playbackFrames: LinkUpdatePlaybackFrame[] = [];
    this.emitEmptyFrame(this._getSimulationTime());

    requests.forEach((request, requestIndex) => {
      const intervalMs = parseMilliseconds(request.interval);
      const requestStartTimeMs = parseTimestamp(request.timestamp);
      if (intervalMs === undefined || requestStartTimeMs === undefined) {
        throw new Error(
          `Invalid link timeline at request ${requestIndex}: timestamp and interval are required.`,
        );
      }

      request.links.forEach((update, groupIndex) => {
        const startTimeMs = requestStartTimeMs + groupIndex * intervalMs;
        playbackFrames.push({
          update,
          requestType: request.type === 'network' ? 'network' : 'satellite',
          startTimeMs,
          endTimeMs: startTimeMs + intervalMs,
          requestIndex,
          groupIndex,
        });
      });
    });

    if (!playbackFrames.length) {
      this.clearTimeline();
      this.emitLinksCompleted(this._getSimulationTime());
      return;
    }

    playbackFrames.sort((left, right) => left.startTimeMs - right.startTimeMs);
    this._playbackFrames = playbackFrames;
    this._activeFrameIndex = -1;
    this._timelineCompleted = false;

    const timelineStart = new Date(playbackFrames[0].startTimeMs);
    this._synchronizeSimulationTime(timelineStart);
    this.advanceTo(timelineStart);
  }

  private emitFrame(frame: LinkUpdatePlaybackFrame) {
    const sampleTime = new Date(frame.startTimeMs);
    if (frame.requestType === 'network') {
      this._groundLinksEventHandler({
        links: [],
        sampleTime,
        requestIndex: frame.requestIndex,
        groupIndex: frame.groupIndex,
      });
      this._satelliteLinksEventHandler({
        links: [],
        sampleTime,
        requestIndex: frame.requestIndex,
        groupIndex: frame.groupIndex,
      });
      this._networkLinksEventHandler({
        links: [frame.update as NetworkPathUpdateState],
        sampleTime,
        requestIndex: frame.requestIndex,
        groupIndex: frame.groupIndex,
      });
      return;
    }

    const update = frame.update as LinkUpdateState;
    this._groundLinksEventHandler({
      links: toSatelliteGroundLinks(update.groundLinks),
      sampleTime,
      requestIndex: frame.requestIndex,
      groupIndex: frame.groupIndex,
    });
    this._satelliteLinksEventHandler({
      links: update.satelliteLinks,
      sampleTime,
      requestIndex: frame.requestIndex,
      groupIndex: frame.groupIndex,
    });
    this._networkLinksEventHandler({
      links: [],
      sampleTime,
      requestIndex: frame.requestIndex,
      groupIndex: frame.groupIndex,
    });
  }

  private emitLinksCompleted(sampleTime: Date) {
    this.emitEmptyFrame(sampleTime, true);
  }

  private emitEmptyFrame(sampleTime: Date, completed = false) {
    this._groundLinksEventHandler({
      links: [],
      sampleTime,
      requestIndex: -1,
      groupIndex: -1,
      completed,
    });
    this._satelliteLinksEventHandler({
      links: [],
      sampleTime,
      requestIndex: -1,
      groupIndex: -1,
      completed,
    });
    this._networkLinksEventHandler({
      links: [],
      sampleTime,
      requestIndex: -1,
      groupIndex: -1,
      completed,
    });
  }

}
