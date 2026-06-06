import type {
  GroundStation,
  SatelliteGroundLink,
  SatellitePoint,
} from '@/features/starlink/types';

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

export const mockGroundStations: GroundStation[] = [
  { id: 'bj-core', name: 'Beijing Core Gateway', city: 'Beijing', longitude: 116.4074, latitude: 39.9042, altitudeMeters: 45 },
  { id: 'sh-edge', name: 'Shanghai Edge Gateway', city: 'Shanghai', longitude: 121.4737, latitude: 31.2304, altitudeMeters: 12 },
  { id: 'sz-south', name: 'Shenzhen South Gateway', city: 'Shenzhen', longitude: 114.0579, latitude: 22.5431, altitudeMeters: 28 },
  { id: 'ur-west', name: 'Urumqi West Gateway', city: 'Urumqi', longitude: 87.6168, latitude: 43.8256, altitudeMeters: 850 },
  { id: 'sg-apac', name: 'Singapore APAC Gateway', city: 'Singapore', longitude: 103.8198, latitude: 1.3521, altitudeMeters: 15 },
  { id: 'fr-eu', name: 'Frankfurt EU Gateway', city: 'Frankfurt', longitude: 8.6821, latitude: 50.1109, altitudeMeters: 112 },
  { id: 'se-na', name: 'Seattle NA Gateway', city: 'Seattle', longitude: -122.3321, latitude: 47.6062, altitudeMeters: 52 },
  { id: 'sp-sa', name: 'Sao Paulo SA Gateway', city: 'Sao Paulo', longitude: -46.6333, latitude: -23.5505, altitudeMeters: 760 },
  { id: 'sy-oce', name: 'Sydney Oceania Gateway', city: 'Sydney', longitude: 151.2093, latitude: -33.8688, altitudeMeters: 58 },
  { id: 'ct-af', name: 'Cape Town Africa Gateway', city: 'Cape Town', longitude: 18.4241, latitude: -33.9249, altitudeMeters: 25 },
];

function toEcef(longitude: number, latitude: number, altitudeKm: number) {
  const lon = longitude * DEG_TO_RAD;
  const lat = latitude * DEG_TO_RAD;
  const radius = EARTH_RADIUS_KM + altitudeKm;
  const cosLat = Math.cos(lat);

  return {
    x: radius * cosLat * Math.cos(lon),
    y: radius * cosLat * Math.sin(lon),
    z: radius * Math.sin(lat),
  };
}

function distanceKm(a: ReturnType<typeof toEcef>, b: ReturnType<typeof toEcef>) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

export function createNearestGroundLinks(
  satellites: SatellitePoint[],
  stations: GroundStation[],
  satelliteIds: string[],
): SatelliteGroundLink[] {
  const idSet = new Set(satelliteIds);
  const stationPositions = stations.map((station) => ({
    station,
    position: toEcef(station.longitude, station.latitude, station.altitudeMeters / 1000),
  }));

  return satellites
    .filter((satellite) => idSet.has(satellite.id))
    .map((satellite) => {
      const satellitePosition = toEcef(satellite.longitude, satellite.latitude, satellite.altitudeKm);
      let nearest = stationPositions[0];
      let nearestDistanceKm = distanceKm(satellitePosition, nearest.position);

      stationPositions.slice(1).forEach((candidate) => {
        const candidateDistanceKm = distanceKm(satellitePosition, candidate.position);
        if (candidateDistanceKm < nearestDistanceKm) {
          nearest = candidate;
          nearestDistanceKm = candidateDistanceKm;
        }
      });

      return {
        satelliteId: satellite.id,
        stationId: nearest.station.id,
        distanceKm: nearestDistanceKm,
      };
    });
}
