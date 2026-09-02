export type GroundStation = {
  id: string;
  name: string;
  city: string;
  longitude: number;
  latitude: number;
  altitudeMeters: number;
};

export type SatelliteGroundLink = {
  satelliteId: string;
  stationId: string;
  distanceKm: number;
};

export type SatelliteGroundLinkFrame = {
  links: SatelliteGroundLink[];
  sampleTime: Date;
  requestIndex: number;
  groupIndex: number;
  completed?: boolean;
};
