import type { SatelliteDetailRow, SatellitePoint } from '@/features/starlink/types';

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatCoordinate(latitude: number, longitude: number) {
  const latDirection = latitude >= 0 ? 'N' : 'S';
  const lonDirection = longitude >= 0 ? 'E' : 'W';

  return `${Math.abs(latitude).toFixed(2)}°${latDirection}, ${Math.abs(longitude).toFixed(2)}°${lonDirection}`;
}

function formatLaunchDesignator(satellite: SatellitePoint) {
  const designator = satellite.line1.slice(9, 17).trim();
  const yearToken = designator.slice(0, 2);
  const launchNumber = designator.slice(2, 5);
  const piece = designator.slice(5);
  const year = Number(yearToken);

  if (!Number.isFinite(year) || !launchNumber) {
    return 'Unknown';
  }

  const fullYear = year >= 57 ? 1900 + year : 2000 + year;
  return `${fullYear} launch ${launchNumber} ${piece}`;
}

function formatEpochDate(satellite: SatellitePoint) {
  const epochYear = Number(satellite.line1.slice(18, 20));
  const epochDay = Number(satellite.line1.slice(20, 32));

  if (!Number.isFinite(epochYear) || !Number.isFinite(epochDay)) {
    return 'Unknown';
  }

  const fullYear = epochYear >= 57 ? 1900 + epochYear : 2000 + epochYear;
  const epochDate = new Date(Date.UTC(fullYear, 0, 1));
  epochDate.setUTCDate(epochDate.getUTCDate() + Math.floor(epochDay) - 1);

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
      label: 'Launch designator',
      value: formatLaunchDesignator(satellite),
    },
    {
      label: 'TLE epoch',
      value: formatEpochDate(satellite),
    },
  ];
}
