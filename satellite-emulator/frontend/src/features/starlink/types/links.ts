import type { InterSatelliteLink } from './satellite';

export type GroundLinkState = {
  groundStationId: string;
  satelliteId: string;
};

export type LinkUpdateState = {
  groundLinks: GroundLinkState[];
  satelliteLinks: InterSatelliteLink[];
};

export type SatelliteLinksRequest = {
  interval: string;
  links: LinkUpdateState[];
  timestamp: string;
  type?: 'satellite';
};

export type LinksRequest = SatelliteLinksRequest;
