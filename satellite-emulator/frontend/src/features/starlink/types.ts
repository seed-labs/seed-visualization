export type PlannedOrbitRecord = {
  id: string;
  name: string;
  noradId: number;
  epochUtc: string;
  inclinationDeg: number;
  eccentricity: number;
  meanMotionRevPerDay: number;
  raanDeg: number;
  argumentOfPerigeeDeg: number;
  meanAnomalyDeg: number;
  line1: string;
  line2: string;
};

export type SatellitePoint = PlannedOrbitRecord & {
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

export type SatelliteGroundLinkFrame = {
  links: SatelliteGroundLink[];
  sampleTime: Date;
  requestIndex: number;
  groupIndex: number;
  completed?: boolean;
};

export type GroundLinkState = {
  groundStationId?: string;
  satelliteId?: string;
};

export type GroundLinksRequest = {
  interval: string;
  groundLinks: GroundLinkState[][];
  timestamp: string;
};

export type SimulationSettings = {
  speed: number;
  showOrbits: boolean;
  showLabels: boolean;
  focusSatelliteZoom: boolean;
  showSatelliteStatus: boolean;
  useLocalGroundLinks: boolean;
  search: string;
};

export type SatelliteDetailRow = {
  label: string;
  value: string;
};
