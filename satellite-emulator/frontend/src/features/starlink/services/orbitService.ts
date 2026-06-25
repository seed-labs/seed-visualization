import type { PlannedOrbitRecord, SatellitePoint } from '@/features/starlink/types';

const EARTH_RADIUS_KM = 6371;
const EARTH_MU_KM3_S2 = 398600.4418;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function meanMotionToAltitudeKm(meanMotionRevPerDay: number) {
  const meanMotionRadPerSecond = meanMotionRevPerDay * 2 * Math.PI / 86400;
  const semiMajorAxisKm = (EARTH_MU_KM3_S2 / meanMotionRadPerSecond ** 2) ** (1 / 3);

  return semiMajorAxisKm - EARTH_RADIUS_KM;
}

function gmstRadians(date: Date) {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const centuries = (julianDate - 2451545.0) / 36525.0;
  const seconds =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * centuries +
    0.093104 * centuries ** 2 -
    0.0000062 * centuries ** 3;

  return normalizeDegrees((seconds / 240) % 360) * DEG_TO_RAD;
}

function toGeodeticFromEci(positionKm: { x: number; y: number; z: number }, date: Date) {
  const theta = gmstRadians(date);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const x = cosTheta * positionKm.x + sinTheta * positionKm.y;
  const y = -sinTheta * positionKm.x + cosTheta * positionKm.y;
  const z = positionKm.z;
  const radiusKm = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  const longitude = Math.atan2(y, x) * RAD_TO_DEG;
  const latitude = Math.asin(z / radiusKm) * RAD_TO_DEG;

  return {
    longitude,
    latitude,
    altitudeKm: radiusKm - EARTH_RADIUS_KM,
  };
}

function rotatePerifocalToEci(
  record: PlannedOrbitRecord,
  vector: { x: number; y: number; z: number },
) {
  const raan = record.raanDeg * DEG_TO_RAD;
  const inclination = record.inclinationDeg * DEG_TO_RAD;
  const argumentOfPerigee = record.argumentOfPerigeeDeg * DEG_TO_RAD;
  const cosRaan = Math.cos(raan);
  const sinRaan = Math.sin(raan);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);
  const cosArg = Math.cos(argumentOfPerigee);
  const sinArg = Math.sin(argumentOfPerigee);

  const rotation = [
    [
      cosRaan * cosArg - sinRaan * sinArg * cosInc,
      -cosRaan * sinArg - sinRaan * cosArg * cosInc,
      sinRaan * sinInc,
    ],
    [
      sinRaan * cosArg + cosRaan * sinArg * cosInc,
      -sinRaan * sinArg + cosRaan * cosArg * cosInc,
      -cosRaan * sinInc,
    ],
    [sinArg * sinInc, cosArg * sinInc, cosInc],
  ];

  return {
    x: rotation[0][0] * vector.x + rotation[0][1] * vector.y + rotation[0][2] * vector.z,
    y: rotation[1][0] * vector.x + rotation[1][1] * vector.y + rotation[1][2] * vector.z,
    z: rotation[2][0] * vector.x + rotation[2][1] * vector.y + rotation[2][2] * vector.z,
  };
}

export function propagateSatellite(record: PlannedOrbitRecord, date: Date): SatellitePoint | null {
  const epochTime = Date.parse(record.epochUtc);
  if (!Number.isFinite(epochTime) || record.meanMotionRevPerDay <= 0) {
    return null;
  }

  const altitudeKm = meanMotionToAltitudeKm(record.meanMotionRevPerDay);
  const semiMajorAxisKm = EARTH_RADIUS_KM + altitudeKm;
  const deltaSeconds = (date.getTime() - epochTime) / 1000;
  const anomalyDeg = normalizeDegrees(
    record.meanAnomalyDeg + record.meanMotionRevPerDay * 360 * deltaSeconds / 86400,
  );
  const anomaly = anomalyDeg * DEG_TO_RAD;
  const orbitalSpeedKmS = Math.sqrt(EARTH_MU_KM3_S2 / semiMajorAxisKm);
  const positionEci = rotatePerifocalToEci(record, {
    x: semiMajorAxisKm * Math.cos(anomaly),
    y: semiMajorAxisKm * Math.sin(anomaly),
    z: 0,
  });
  const geodetic = toGeodeticFromEci(positionEci, date);

  return {
    ...record,
    longitude: geodetic.longitude,
    latitude: geodetic.latitude,
    altitudeKm: geodetic.altitudeKm,
    velocityKmS: orbitalSpeedKmS,
  };
}

export function sampleOrbit(record: PlannedOrbitRecord, date: Date, minutes = 96, stepMinutes = 1) {
  const positions: Array<[number, number, number]> = [];
  const startTime = date.getTime() - (minutes * 60 * 1000) / 2;

  for (let offset = 0; offset <= minutes; offset += stepMinutes) {
    const sample = propagateSatellite(record, new Date(startTime + offset * 60 * 1000));
    if (sample) {
      positions.push([sample.longitude, sample.latitude, sample.altitudeKm * 1000]);
    }
  }

  return positions;
}

export function propagateMany(records: PlannedOrbitRecord[], date: Date): SatellitePoint[] {
  return records
    .map((record) => propagateSatellite(record, date))
    .filter((point): point is SatellitePoint => Boolean(point));
}
