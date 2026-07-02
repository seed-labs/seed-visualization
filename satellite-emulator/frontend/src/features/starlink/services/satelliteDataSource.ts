import { appConfig } from '@/config/env';
import type {
  GroundLinksRequest,
  GroundLinkState,
  InterSatelliteLink,
  SatelliteLinkFrame,
  SatelliteLinksRequest,
  SatelliteGroundLinkFrame,
  SatelliteGroundLink,
} from '@/features/starlink/types';

export type SatelliteDataEvent = 'ground-links' | 'satellite-links' | 'dead';

type GroundLinksMessage = {
  type: 'SATELLITE_GROUND_LINKS';
  result: GroundLinksRequest | GroundLinksRequest[];
};

type SatelliteLinksMessage = {
  type: 'SATELLITE_LINKS';
  result: SatelliteLinksRequest | SatelliteLinksRequest[];
};

type GroundLinkPlaybackFrame = {
  links: GroundLinkState[];
  offsetMs: number;
  holdMs: number;
  requestIndex: number;
  groupIndex: number;
};

type SatelliteLinkPlaybackFrame = {
  links: InterSatelliteLink[];
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
    (link.groundStationId === undefined || typeof link.groundStationId === 'string') &&
    (link.satelliteId === undefined || typeof link.satelliteId === 'string'),
  );
}

function isGroundLinksMessage(value: unknown): value is GroundLinksMessage {
  const message = value as GroundLinksMessage;

  return Boolean(
    message &&
    message.type === 'SATELLITE_GROUND_LINKS' &&
    (isGroundLinksRequest(message.result) ||
      (Array.isArray(message.result) && message.result.every(isGroundLinksRequest))),
  );
}

function isGroundLinksRequest(value: unknown): value is GroundLinksRequest {
  const request = value as GroundLinksRequest;

  return Boolean(
    request &&
    typeof request.interval === 'string' &&
    typeof request.timestamp === 'string' &&
    Array.isArray(request.groundLinks) &&
    request.groundLinks.every((links) => Array.isArray(links) && links.every(isGroundLinkState)),
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

function isSatelliteLinksRequest(value: unknown): value is SatelliteLinksRequest {
  const request = value as SatelliteLinksRequest;

  return Boolean(
    request &&
    typeof request.interval === 'string' &&
    typeof request.timestamp === 'string' &&
    Array.isArray(request.satelliteLinks) &&
    request.satelliteLinks.every(
      (links) => Array.isArray(links) && links.every(isInterSatelliteLink),
    ),
  );
}

function isSatelliteLinksMessage(value: unknown): value is SatelliteLinksMessage {
  const message = value as SatelliteLinksMessage;

  return Boolean(
    message &&
    message.type === 'SATELLITE_LINKS' &&
    (isSatelliteLinksRequest(message.result) ||
      (Array.isArray(message.result) && message.result.every(isSatelliteLinksRequest))),
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
  return links
    .filter((link) => link.satelliteId && link.groundStationId)
    .map((link) => ({
      satelliteId: link.satelliteId!,
      stationId: link.groundStationId!,
      distanceKm: 0,
    }));
}

function normalizeSimulationSpeed(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export class SatelliteDataSource {
  private _socket?: WebSocket;
  private _connected = false;
  private _groundLinkTimers: number[] = [];
  private _satelliteLinkTimers: number[] = [];
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
    this._socket = new WebSocket(`${protocol}://${host}${appConfig.api.basePath}/satellite/link-updates`);

    this._socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data.toString());
        if (isGroundLinksMessage(message)) {
          const requests = Array.isArray(message.result) ? message.result : [message.result];
          this.scheduleGroundLinks(requests);
        } else if (isSatelliteLinksMessage(message)) {
          const requests = Array.isArray(message.result) ? message.result : [message.result];
          this.scheduleSatelliteLinks(requests);
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
    this.clearGroundLinkTimers();
    this.clearSatelliteLinkTimers();
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

  private clearGroundLinkTimers() {
    this._groundLinkTimers.forEach((timer) => window.clearTimeout(timer));
    this._groundLinkTimers = [];
  }

  private clearSatelliteLinkTimers() {
    this._satelliteLinkTimers.forEach((timer) => window.clearTimeout(timer));
    this._satelliteLinkTimers = [];
  }

  private scheduleGroundLinks(requests: GroundLinksRequest[]) {
    this.clearGroundLinkTimers();
    const receivedAtMs = Date.now();
    const playbackFrames: GroundLinkPlaybackFrame[] = [];
    let offsetMs = 0;

    requests.forEach((request, requestIndex) => {
      const intervalMs = parseMilliseconds(request.interval);

      request.groundLinks.forEach((links, index) => {
        // links = links.filter((link) => link.satelliteId === "940192")
        playbackFrames.push({
          links,
          offsetMs: offsetMs + index * intervalMs,
          holdMs: intervalMs,
          requestIndex,
          groupIndex: index,
        });
      });

      offsetMs += request.groundLinks.length * intervalMs;
    });

    if (!playbackFrames.length) {
      this.emitGroundLinksCompleted(new Date(receivedAtMs));
      return;
    }

    this.playGroundLinkFrame(playbackFrames, 0, receivedAtMs);
  }

  private getPlaybackDelay(simulationDelayMs: number) {
    return simulationDelayMs / normalizeSimulationSpeed(this._getSimulationSpeed());
  }

  private playGroundLinkFrame(
    frames: GroundLinkPlaybackFrame[],
    index: number,
    receivedAtMs: number,
  ) {
    const frame = frames[index];
    this._groundLinksEventHandler({
      links: toSatelliteGroundLinks(frame.links),
      sampleTime: new Date(receivedAtMs + frame.offsetMs),
      requestIndex: frame.requestIndex,
      groupIndex: frame.groupIndex,
    });

    const nextFrame = frames[index + 1];
    const nextDelayMs = nextFrame ? nextFrame.offsetMs - frame.offsetMs : frame.holdMs;
    const nextAction = () => {
      if (nextFrame) {
        this.playGroundLinkFrame(frames, index + 1, receivedAtMs);
        return;
      }

      this.emitGroundLinksCompleted(new Date(receivedAtMs + frame.offsetMs + frame.holdMs));
    };

    this._groundLinkTimers.push(window.setTimeout(nextAction, this.getPlaybackDelay(nextDelayMs)));
  }

  private emitGroundLinksCompleted(sampleTime: Date) {
    this._groundLinksEventHandler({
      links: [],
      sampleTime,
      requestIndex: -1,
      groupIndex: -1,
      completed: true,
    });
  }

  private scheduleSatelliteLinks(requests: SatelliteLinksRequest[]) {
    this.clearSatelliteLinkTimers();
    const receivedAtMs = Date.now();
    const playbackFrames: SatelliteLinkPlaybackFrame[] = [];
    let offsetMs = 0;

    requests.forEach((request, requestIndex) => {
      const intervalMs = parseMilliseconds(request.interval);

      request.satelliteLinks.forEach((links, index) => {
        playbackFrames.push({
          links,
          offsetMs: offsetMs + index * intervalMs,
          holdMs: intervalMs,
          requestIndex,
          groupIndex: index,
        });
      });

      offsetMs += request.satelliteLinks.length * intervalMs;
    });

    if (!playbackFrames.length) {
      this.emitSatelliteLinksCompleted(new Date(receivedAtMs));
      return;
    }

    this.playSatelliteLinkFrame(playbackFrames, 0, receivedAtMs);
  }

  private playSatelliteLinkFrame(
    frames: SatelliteLinkPlaybackFrame[],
    index: number,
    receivedAtMs: number,
  ) {
    const frame = frames[index];
    this._satelliteLinksEventHandler({
      links: frame.links,
      sampleTime: new Date(receivedAtMs + frame.offsetMs),
      requestIndex: frame.requestIndex,
      groupIndex: frame.groupIndex,
    });

    const nextFrame = frames[index + 1];
    const nextDelayMs = nextFrame ? nextFrame.offsetMs - frame.offsetMs : frame.holdMs;
    const nextAction = () => {
      if (nextFrame) {
        this.playSatelliteLinkFrame(frames, index + 1, receivedAtMs);
        return;
      }

      this.emitSatelliteLinksCompleted(new Date(receivedAtMs + frame.offsetMs + frame.holdMs));
    };

    this._satelliteLinkTimers.push(
      window.setTimeout(nextAction, this.getPlaybackDelay(nextDelayMs)),
    );
  }

  private emitSatelliteLinksCompleted(sampleTime: Date) {
    this._satelliteLinksEventHandler({
      links: [],
      sampleTime,
      requestIndex: -1,
      groupIndex: -1,
      completed: true,
    });
  }
}
