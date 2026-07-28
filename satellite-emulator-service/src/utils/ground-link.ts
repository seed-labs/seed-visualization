const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;
const MAX_GROUND_LINK_DISTANCE_KM = 1100;

export interface SatellitePosition {
    id: string;
    longitude: number;
    latitude: number;
    altitudeKm: number;
}

export interface GroundStation {
    id: string;
    name: string;
    city: string;
    longitude: number;
    latitude: number;
    altitudeMeters: number;
}

export interface SatelliteGroundLink {
    satelliteId: string;
    stationId: string;
    distanceKm: number;
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

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function isSatellitePosition(value: unknown): value is SatellitePosition {
    const satellite = value as SatellitePosition;
    return Boolean(
        satellite &&
        typeof satellite.id === 'string' &&
        isFiniteNumber(satellite.longitude) &&
        isFiniteNumber(satellite.latitude) &&
        isFiniteNumber(satellite.altitudeKm)
    );
}

export function isGroundStation(value: unknown): value is GroundStation {
    const station = value as GroundStation;
    return Boolean(
        station &&
        typeof station.id === 'string' &&
        typeof station.name === 'string' &&
        typeof station.city === 'string' &&
        isFiniteNumber(station.longitude) &&
        isFiniteNumber(station.latitude) &&
        isFiniteNumber(station.altitudeMeters)
    );
}

export function createNearestGroundLinks(
    satellites: SatellitePosition[],
    stations: GroundStation[],
    satelliteIds?: string[],
): SatelliteGroundLink[] {
    if (!stations.length) {
        return [];
    }

    const selectedIds = satelliteIds?.length ? new Set(satelliteIds) : undefined;
    const stationPositions = stations.map((station) => ({
        station,
        position: toEcef(station.longitude, station.latitude, station.altitudeMeters / 1000),
    }));

    return satellites
        .filter((satellite) => !selectedIds || selectedIds.has(satellite.id))
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
