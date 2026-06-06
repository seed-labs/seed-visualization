export type TleRecord = {
  id: string;
  name: string;
  line1: string;
  line2: string;
};

export type SatellitePoint = TleRecord & {
  longitude: number;
  latitude: number;
  altitudeKm: number;
  velocityKmS: number;
};

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

export type SimulationSettings = {
  speed: number;
  showOrbits: boolean;
  showLabels: boolean;
  focusSatelliteZoom: boolean;
  showSatelliteStatus: boolean;
  search: string;
};

export type SatelliteDetailRow = {
  label: string;
  value: string;
};
