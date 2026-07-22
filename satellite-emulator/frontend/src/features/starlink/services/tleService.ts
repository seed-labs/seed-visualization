import plannedShellOrbitData from '../../../../../tmp/planned_shell_orbit.json';
import type { PlannedOrbitRecord } from '@/features/starlink/types';

type PlannedShellOrbitRecordJson = {
  argument_of_perigee_deg: number;
  eccentricity: number;
  epoch_utc: string;
  inclination_deg: number;
  line1: string;
  line2: string;
  mean_anomaly_deg: number;
  mean_motion_rev_per_day: number;
  norad_id: number;
  plane_index: number;
  raan_deg: number;
  satellite_name: string;
};

type PlannedShellOrbitDataJson = {
  selected_records?: PlannedShellOrbitRecordJson[];
  shell_selection?: {
    plane_manifest?: Array<{
      norad_ids: number[];
      plane_id: string;
    }>;
  };
};

function isPlannedShellOrbitRecord(value: unknown): value is PlannedShellOrbitRecordJson {
  const record = value as PlannedShellOrbitRecordJson;

  return Boolean(
    record &&
      typeof record.satellite_name === 'string' &&
      typeof record.norad_id === 'number' &&
      typeof record.plane_index === 'number' &&
      typeof record.epoch_utc === 'string' &&
      typeof record.inclination_deg === 'number' &&
      typeof record.eccentricity === 'number' &&
      typeof record.mean_motion_rev_per_day === 'number' &&
      typeof record.raan_deg === 'number' &&
      typeof record.argument_of_perigee_deg === 'number' &&
      typeof record.mean_anomaly_deg === 'number' &&
      typeof record.line1 === 'string' &&
      typeof record.line2 === 'string',
  );
}

function toPlannedOrbitRecord(
  record: PlannedShellOrbitRecordJson,
  orbitPlaneId: string,
): PlannedOrbitRecord {
  return {
    id: String(record.norad_id),
    name: record.satellite_name,
    noradId: record.norad_id,
    orbitPlaneId,
    epochUtc: record.epoch_utc,
    inclinationDeg: record.inclination_deg,
    eccentricity: record.eccentricity,
    meanMotionRevPerDay: record.mean_motion_rev_per_day,
    raanDeg: record.raan_deg,
    argumentOfPerigeeDeg: record.argument_of_perigee_deg,
    meanAnomalyDeg: record.mean_anomaly_deg,
    line1: record.line1,
    line2: record.line2,
  };
}

export function parsePlannedOrbitRecords(
  data: PlannedShellOrbitDataJson = plannedShellOrbitData,
): PlannedOrbitRecord[] {
  const records = data.selected_records ?? [];

  if (!records.every(isPlannedShellOrbitRecord)) {
    throw new Error('planned_shell_orbit.json selected_records contains invalid orbit records.');
  }

  const orbitPlaneByNoradId = new Map<number, string>();
  data.shell_selection?.plane_manifest?.forEach((plane) => {
    plane.norad_ids.forEach((noradId) => orbitPlaneByNoradId.set(noradId, plane.plane_id));
  });

  return records.map((record) =>
    toPlannedOrbitRecord(
      record,
      orbitPlaneByNoradId.get(record.norad_id) ??
        `plane-${String(record.plane_index).padStart(3, '0')}`,
    ),
  );
}
