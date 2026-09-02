import { FALLBACK_TRAFFIC_NODE_CITIES } from '@/features/starlink/constants/trafficReplay';
import type { EmulatorContainerInfo } from '@/features/starlink/services/emulatorContainerService';

export type TrafficGeoLocation = {
  latitude: number;
  longitude: number;
};

export type TrafficFallbackLocation = TrafficGeoLocation & {
  city?: string;
};

export type TrafficFallbackLocationMap = Record<string, TrafficFallbackLocation>;

export function getContainerGeoLocation(container: EmulatorContainerInfo): TrafficGeoLocation | undefined {
  const emulatorInfo = container.meta?.emulatorInfo;
  const longitude = Number(emulatorInfo?.longitude);
  const latitude = Number(emulatorInfo?.latitude);

  if (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
  ) {
    return { longitude, latitude };
  }

  return undefined;
}

export function getFallbackTrafficNodeLocation(
  locations: TrafficFallbackLocationMap,
  nodeId: string | undefined,
): TrafficFallbackLocation | undefined {
  if (!nodeId) {
    return undefined;
  }

  return locations[nodeId];
}

export function getTrafficLocationCity(location: unknown) {
  return typeof location === 'object' &&
    location !== null &&
    'city' in location &&
    typeof location.city === 'string'
    ? location.city
    : undefined;
}

export function pickFallbackTrafficNodeLocation(
  nodeId: string,
  containers: EmulatorContainerInfo[],
  fallbackLocations: TrafficFallbackLocationMap,
  minDistanceKm: number,
) {
  const occupiedLocations = getOccupiedTrafficNodeLocations(containers, fallbackLocations, nodeId);
  const candidates = createFallbackTrafficNodeCandidates();
  let bestCandidate = candidates[0];
  let bestDistanceKm = -1;

  candidates.forEach((candidate) => {
    const nearestDistanceKm = getNearestLocationDistanceKm(candidate, occupiedLocations);
    if (nearestDistanceKm > bestDistanceKm) {
      bestCandidate = candidate;
      bestDistanceKm = nearestDistanceKm;
    }
  });

  if (bestDistanceKm >= minDistanceKm || !occupiedLocations.length) {
    return bestCandidate;
  }

  return createDeterministicFallbackLocation(nodeId, occupiedLocations);
}

export function getNearestLocationDistanceKm(
  candidate: TrafficGeoLocation,
  occupiedLocations: TrafficGeoLocation[],
) {
  if (!occupiedLocations.length) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(
    ...occupiedLocations.map((location) => getGreatCircleDistanceKm(candidate, location)),
  );
}

export function getOccupiedTrafficNodeLocations(
  containers: EmulatorContainerInfo[],
  fallbackLocations: TrafficFallbackLocationMap,
  excludeNodeId?: string,
) {
  const occupiedLocations: TrafficGeoLocation[] = [];
  const occupiedKeys = new Set<string>();

  function addOccupiedLocation(location: TrafficGeoLocation) {
    const key = `${location.longitude.toFixed(5)},${location.latitude.toFixed(5)}`;
    if (occupiedKeys.has(key)) {
      return;
    }

    occupiedKeys.add(key);
    occupiedLocations.push(location);
  }

  containers.forEach((container) => {
    const nodeId = container.meta?.emulatorInfo?.name;
    const matchesExcludedNode =
      excludeNodeId !== undefined &&
      excludeNodeId !== '' &&
      (
        container.Id === excludeNodeId ||
        container.Id.startsWith(excludeNodeId) ||
        excludeNodeId.startsWith(container.Id) ||
        (nodeId && nodeId === excludeNodeId)
      );
    if (matchesExcludedNode) {
      return;
    }

    const geoLocation = getContainerGeoLocation(container);
    if (geoLocation) {
      addOccupiedLocation(geoLocation);
    }
  });

  Object.entries(fallbackLocations).forEach(([nodeId, location]) => {
    if (nodeId === excludeNodeId) {
      return;
    }

    addOccupiedLocation({
      longitude: location.longitude,
      latitude: location.latitude,
    });
  });

  return occupiedLocations;
}

function createFallbackTrafficNodeCandidates() {
  const candidates: Array<TrafficFallbackLocation & { city: string }> = [];
  const rings = [
    { radius: 0, count: 1 },
    { radius: 2.4, count: 8 },
    { radius: 4.8, count: 12 },
    { radius: 7.2, count: 16 },
    { radius: 10.5, count: 20 },
  ];

  FALLBACK_TRAFFIC_NODE_CITIES.forEach((city, cityIndex) => {
    rings.forEach((ring) => {
      for (let index = 0; index < ring.count; index += 1) {
        const angle = ring.count === 1
          ? 0
          : ((Math.PI * 2) / ring.count) * index + cityIndex * 0.37;
        const longitude = clampLongitude(city.longitude + Math.cos(angle) * ring.radius);
        const latitude = clampLatitude(city.latitude + Math.sin(angle) * ring.radius);
        candidates.push({
          city: ring.radius === 0 ? city.name : `${city.name}+${ring.radius.toFixed(1)}`,
          longitude,
          latitude,
        });
      }
    });
  });

  return candidates;
}

function createDeterministicFallbackLocation(
  nodeId: string,
  occupiedLocations: TrafficGeoLocation[],
) {
  let bestLocation = {
    city: 'Generated',
    longitude: 0,
    latitude: 0,
  };
  let bestDistanceKm = -1;
  const seed = hashString(nodeId);

  for (let index = 0; index < 240; index += 1) {
    const longitude = normalizeLongitude(seed * 0.037 + index * 137.508);
    const latitude = clampLatitude(-58 + ((seed * 0.019 + index * 47.231) % 116));
    const candidate = {
      city: 'Generated',
      longitude,
      latitude,
    };
    const nearestDistanceKm = getNearestLocationDistanceKm(candidate, occupiedLocations);
    if (nearestDistanceKm > bestDistanceKm) {
      bestLocation = candidate;
      bestDistanceKm = nearestDistanceKm;
    }
  }

  return bestLocation;
}

function getGreatCircleDistanceKm(
  left: TrafficGeoLocation,
  right: TrafficGeoLocation,
) {
  const earthRadiusKm = 6371;
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const halfChord =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function clampLatitude(latitude: number) {
  return Math.max(-75, Math.min(75, latitude));
}

function clampLongitude(longitude: number) {
  return Math.max(-180, Math.min(180, longitude));
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function hashString(value: string) {
  return Array.from(value).reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0;
  }, 2166136261);
}
