import {
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from 'satellite.js';
import type { SatellitePoint, TleRecord } from '@/features/starlink/types';

const RAD_TO_DEG = 180 / Math.PI;

const satrecCache = new Map<string, SatRec>();

function getSatrec(record: TleRecord): SatRec {
  const cached = satrecCache.get(record.id);
  if (cached) {
    return cached;
  }

  const satrec = twoline2satrec(record.line1, record.line2);
  satrecCache.set(record.id, satrec);
  return satrec;
}

export function propagateSatellite(record: TleRecord, date: Date): SatellitePoint | null {
  const satrec = getSatrec(record);
  const result = propagate(satrec, date);

  if (!result || !result.position || !result.velocity || satrec.error !== 0) {
    return null;
  }

  const geodetic = eciToGeodetic(result.position, gstime(date));
  const velocityKmS = Math.sqrt(
    result.velocity.x ** 2 + result.velocity.y ** 2 + result.velocity.z ** 2,
  );

  return {
    ...record,
    longitude: geodetic.longitude * RAD_TO_DEG,
    latitude: geodetic.latitude * RAD_TO_DEG,
    altitudeKm: geodetic.height,
    velocityKmS,
  };
}

export function sampleOrbit(record: TleRecord, date: Date, minutes = 96, stepMinutes = 1) {
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

export function propagateMany(records: TleRecord[], date: Date): SatellitePoint[] {
  return records
    .map((record) => propagateSatellite(record, date))
    .filter((point): point is SatellitePoint => Boolean(point));
}
