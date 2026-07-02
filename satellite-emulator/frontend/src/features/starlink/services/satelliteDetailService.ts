import type { SatelliteDetailRow, SatellitePoint } from '@/features/starlink/types';

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatCoordinate(latitude: number, longitude: number) {
  // const latDirection = latitude >= 0 ? 'N' : 'S';
  // const lonDirection = longitude >= 0 ? 'E' : 'W';

  // return ${Math.abs(latitude).toFixed(2)} deg ${latDirection}, ${Math.abs(longitude).toFixed(2)} deg ${lonDirection};
  return `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`;
}

function formatEpochDate(satellite: SatellitePoint) {
  const epochDate = new Date(satellite.epochUtc);

  if (Number.isNaN(epochDate.getTime())) {
    return 'Unknown';
  }

  return MONTH_FORMATTER.format(epochDate);
}

export function createSatelliteDetailRows(satellite: SatellitePoint): SatelliteDetailRow[] {
  return [
    {
      label: 'NORAD ID',
      value: satellite.id,
    },
    {
      label: 'Altitude',
      value: `${satellite.altitudeKm.toFixed(1)} km`,
    },
    {
      label: 'Velocity',
      value: `${satellite.velocityKmS.toFixed(2)} km/s`,
    },
    {
      label: 'Subsatellite point',
      value: formatCoordinate(satellite.latitude, satellite.longitude),
    },
    {
      label: 'Inclination',
      value: `${satellite.inclinationDeg.toFixed(2)} deg`,
    },
    {
      label: 'RAAN',
      value: `${satellite.raanDeg.toFixed(2)} deg`,
    },
    {
      label: 'Mean motion',
      value: `${satellite.meanMotionRevPerDay.toFixed(6)} rev/day`,
    },
    {
      label: 'Orbit epoch',
      value: formatEpochDate(satellite),
    },
  ];
}
