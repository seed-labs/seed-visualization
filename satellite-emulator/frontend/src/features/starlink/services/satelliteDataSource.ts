import { appConfig } from '@/config/env';
import type {
  GroundLinkState,
  InterSatelliteLink,
  LinksRequest,
  LinkUpdateState,
  SatelliteGroundLink,
  SatelliteGroundLinkFrame,
  SatelliteLinkFrame,
} from '@/features/starlink/types';

export type SatelliteDataEvent = 'ground-links' | 'satellite-links' | 'dead';

type LinkUpdatesMessage = {
  type: 'SATELLITE_LINK_UPDATES';
  result: LinksRequest | LinksRequest[];
};

type LinkUpdatePlaybackFrame = {
  update: LinkUpdateState;
  offsetMs: number;
  holdMs: number;
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

function isLinksRequest(value: unknown): value is LinksRequest {
  const request = value as LinksRequest;

  return Boolean(
    request &&
      typeof request.interval === 'string' &&
      typeof request.timestamp === 'string' &&
      Array.isArray(request.links) &&
      request.links.every(isLinkUpdateState),
  );
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

  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : 0;
}

function toSatelliteGroundLinks(links: GroundLinkState[]): SatelliteGroundLink[] {
  return links.map((link) => ({
    satelliteId: link.satelliteId,
    stationId: link.groundStationId,
    distanceKm: 0,
  }));
}

function normalizeSimulationSpeed(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export class SatelliteDataSource {
  private _socket?: WebSocket;
  private _connected = false;
  private _linkUpdateTimers: number[] = [];
  private _groundLinksEventHandler: (data: SatelliteGroundLinkFrame) => void = () => undefined;
  private _satelliteLinksEventHandler: (data: SatelliteLinkFrame) => void = () => undefined;
  private _errorHandler: (error: Event | CloseEvent | unknown) => void = () => undefined;

  constructor(private readonly _getSimulationSpeed: () => number = () => 1) {}

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
    this.clearLinkUpdateTimers();
    this._socket?.close();
    this._socket = undefined;
  }

  on(eventName: 'ground-links', callback: (data: SatelliteGroundLinkFrame) => void): void;
  on(eventName: 'satellite-links', callback: (data: SatelliteLinkFrame) => void): void;
  on(eventName: 'dead', callback: (data: unknown) => void): void;
  on(eventName: SatelliteDataEvent, callback: (data: any) => void = () => undefined) {
    switch (eventName) {
      case 'ground-links':
        this._groundLinksEventHandler = callback as (data: SatelliteGroundLinkFrame) => void;
        break;
      case 'satellite-links':
        this._satelliteLinksEventHandler = callback as (data: SatelliteLinkFrame) => void;
        break;
      case 'dead':
        this._errorHandler = callback;
        break;
    }
  }

  private clearLinkUpdateTimers() {
    this._linkUpdateTimers.forEach((timer) => window.clearTimeout(timer));
    this._linkUpdateTimers = [];
  }

  private scheduleLinkUpdates(requests: LinksRequest[]) {
    this.clearLinkUpdateTimers();
    const receivedAtMs = Date.now();
    const playbackFrames: LinkUpdatePlaybackFrame[] = [];
    let offsetMs = 0;

    requests.forEach((request, requestIndex) => {
      const intervalMs = parseMilliseconds(request.interval);

      request.links.forEach((update, groupIndex) => {
        playbackFrames.push({
          update,
          offsetMs: offsetMs + groupIndex * intervalMs,
          holdMs: intervalMs,
          requestIndex,
          groupIndex,
        });
      });

      offsetMs += request.links.length * intervalMs;
    });

    if (!playbackFrames.length) {
      this.emitLinksCompleted(new Date(receivedAtMs));
      return;
    }

    this.playLinkUpdateFrame(playbackFrames, 0, receivedAtMs);
  }

  private playLinkUpdateFrame(
    frames: LinkUpdatePlaybackFrame[],
    index: number,
    receivedAtMs: number,
  ) {
    const frame = frames[index];
    const sampleTime = new Date(receivedAtMs + frame.offsetMs);

    this._groundLinksEventHandler({
      links: toSatelliteGroundLinks(frame.update.groundLinks),
      sampleTime,
      requestIndex: frame.requestIndex,
      groupIndex: frame.groupIndex,
    });
    this._satelliteLinksEventHandler({
      links: frame.update.satelliteLinks,
      sampleTime,
      requestIndex: frame.requestIndex,
      groupIndex: frame.groupIndex,
    });

    const nextFrame = frames[index + 1];
    const nextDelayMs = nextFrame ? nextFrame.offsetMs - frame.offsetMs : frame.holdMs;
    const nextAction = () => {
      if (nextFrame) {
        this.playLinkUpdateFrame(frames, index + 1, receivedAtMs);
        return;
      }

      this.emitLinksCompleted(new Date(receivedAtMs + frame.offsetMs + frame.holdMs));
    };

    this._linkUpdateTimers.push(
      window.setTimeout(nextAction, this.getPlaybackDelay(nextDelayMs)),
    );
  }

  private emitLinksCompleted(sampleTime: Date) {
    this._groundLinksEventHandler({
      links: [],
      sampleTime,
      requestIndex: -1,
      groupIndex: -1,
      completed: true,
    });
    this._satelliteLinksEventHandler({
      links: [],
      sampleTime,
      requestIndex: -1,
      groupIndex: -1,
      completed: true,
    });
  }

  private getPlaybackDelay(simulationDelayMs: number) {
    return simulationDelayMs / normalizeSimulationSpeed(this._getSimulationSpeed());
  }
}
