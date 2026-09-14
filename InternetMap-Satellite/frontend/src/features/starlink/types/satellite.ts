export type PlannedOrbitRecord = {
  id: string;
  name: string;
  noradId: number;
  orbitPlaneId: string;
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

export type InterSatelliteLink = {
  satelliteAId: string;
  satelliteBId: string;
};

export type SatelliteLinkFrame = {
  links: InterSatelliteLink[];
  sampleTime: Date;
  requestIndex: number;
  groupIndex: number;
  completed?: boolean;
};
