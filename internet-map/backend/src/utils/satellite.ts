import * as satellite from "satellite.js";

export type OrbitPoint = {
    lat: number;
    lon: number;
    height_km: number;
};

type Satrec = ReturnType<typeof satellite.twoline2satrec>;

export function getSatelliteSpeed(
    satrec: Satrec,
    time = new Date()
): number | null {
    const result = satellite.propagate(
        satrec,
        time
    );

    const velocity = result.velocity

    if (!velocity) {
        return null;
    }
    return Math.sqrt(
        velocity.x ** 2 +
        velocity.y ** 2 +
        velocity.z ** 2
    );
}

export function getSatellitePosition(
    satrec: Satrec,
    time = new Date()
): OrbitPoint | null {
    const result = satellite.propagate(
        satrec,
        time
    );

    const positionEci = result.position;
    const velocity = result.velocity

    if (!positionEci || !velocity) {
        return null;
    }
    const gmst = satellite.gstime(time);
    const geodetic =
        satellite.eciToGeodetic(
            positionEci,
            gmst
        );
    const speed =
        Math.sqrt(
            velocity.x ** 2 +
            velocity.y ** 2 +
            velocity.z ** 2
        );

    return {
        lat: satellite.degreesLat(
            geodetic.latitude
        ),

        lon: satellite.degreesLong(
            geodetic.longitude
        ),

        height_km: geodetic.height,
    };
}

export function generateOrbitPoints(line1: string, line2: string): { points: OrbitPoint[], speed_km_s: number | null } {
    const satrec = satellite.twoline2satrec(
        line1,
        line2
    );

    const points: OrbitPoint[] = [];
    const orbitMinutes = 92;
    const pointCount = 360;
    const now = Date.now();

    const speed_km_s = getSatelliteSpeed(satrec, new Date(now))

    for (let i = 0; i < pointCount; i++) {
        const t = now + (orbitMinutes * 60 * 1000 * i) / pointCount;
        const date = new Date(t);
        const p = getSatellitePosition(satrec, date);

        if (p) {
            points.push(p);
        }
    }

    return {points, speed_km_s};
}
