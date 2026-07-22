import type {
  GroundStation,
  SatelliteGroundLink,
  SatellitePoint,
} from '@/features/starlink/types';
import { emulatorRequest } from '@/utils/request';
import { mockGroundStations } from '@/features/starlink/services/mockGroundStations';

export { mockGroundStations };

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;
const MAX_GROUND_LINK_DISTANCE_KM = 1100;

type ApiResponse<Result> = {
  ok: boolean;
  result: Result;
};

type EmulatorNetwork = {
  Id: string;
  Name?: string;
  meta?: {
    emulatorInfo?: {
      type?: string;
      scope?: string;
      name?: string;
      displayname?: string;
      description?: string;
      longitude?: string;
      latitude?: string;
    };
  };
};

function readCoordinate(value: string | number | undefined) {
  if (value === undefined || value === '') {
    return undefined;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
}

function isValidCoordinate(longitude: number, latitude: number) {
  return Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90;
}

function isStarNetwork(network: EmulatorNetwork) {
  return network.meta?.emulatorInfo?.type?.toLowerCase() === 'global';
}

function toGroundStation(network: EmulatorNetwork): GroundStation | undefined {
  const info = network.meta?.emulatorInfo;
  const longitude = readCoordinate(info?.longitude);
  const latitude = readCoordinate(info?.latitude);

  if (longitude === undefined || latitude === undefined || !isValidCoordinate(longitude, latitude)) {
    return undefined;
  }

  const name = info?.displayname || info?.name || network.Name || network.Id.slice(0, 12);

  return {
    id: network.Id,
    name,
    city: info?.displayname || info?.scope || info?.name || 'Star node',
    longitude,
    latitude,
    altitudeMeters: 0,
  };
}

export async function fetchGroundStationsFromEmulator(): Promise<GroundStation[]> {
  return mockGroundStations

  // const response = await emulatorRequest.get('/network') as unknown as ApiResponse<EmulatorNetwork[]>;
  
  // if (!response.ok || !Array.isArray(response.result)) {
  //   throw new Error('Failed to load emulator star nodes.');
  // }
  
  // return response.result
  //   .filter(isStarNetwork)
  //   .map(toGroundStation)
  //   .filter((station): station is GroundStation => Boolean(station));
}

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
  if (!stations.length) {
    return [];
  }

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

      if (nearestDistanceKm > MAX_GROUND_LINK_DISTANCE_KM) {
        return undefined;
      }

      return {
        satelliteId: satellite.id,
        stationId: nearest.station.id,
        distanceKm: nearestDistanceKm,
      };
    })
    .filter((link): link is SatelliteGroundLink => Boolean(link));
}
