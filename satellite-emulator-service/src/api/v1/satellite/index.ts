import WebSocket from 'ws';
import express from 'express';
import {promises as fs} from 'fs';
import path from 'path';

let satelliteLinkSubscribers: WebSocket[] = [];
const router = express.Router();
const linksJsonParser = express.json({
    limit: '10kb',
});
const projectDirectory = path.resolve(__dirname, '../../../..');
const linksDirectory = path.join(projectDirectory, 'tmp');
const defaultLinksPath = path.join(linksDirectory, 'links.json');
const plannedShellOrbitPath = path.join(linksDirectory, 'planned_shell_orbit.json');
const starlinkGatewaysPath = path.join(linksDirectory, 'starlink_gateways.json');

interface GroundLink {
    groundStationId: string;
    satelliteId: string;
}

interface SatelliteLink {
    satelliteAId: string;
    satelliteBId: string;
}

interface SatelliteLinkUpdate {
    groundLinks: GroundLink[];
    satelliteLinks: SatelliteLink[];
}

interface SatelliteLinksRequest {
    interval: string;
    links: SatelliteLinkUpdate[];
    timestamp: string;
    type?: 'satellite';
}

type LinksRequest = SatelliteLinksRequest;

function isGroundLink(value: unknown): value is GroundLink {
    const link = value as GroundLink;

    return Boolean(
        link &&
        typeof link.groundStationId === 'string' &&
        typeof link.satelliteId === 'string'
    );
}

function isSatelliteLink(value: unknown): value is SatelliteLink {
    const link = value as SatelliteLink;

    return Boolean(
        link &&
        typeof link.satelliteAId === 'string' &&
        typeof link.satelliteBId === 'string'
    );
}

function isSatelliteLinkUpdate(value: unknown): value is SatelliteLinkUpdate {
    const update = value as SatelliteLinkUpdate;

    return Boolean(
        update &&
        Array.isArray(update.groundLinks) &&
        update.groundLinks.every(isGroundLink) &&
        Array.isArray(update.satelliteLinks) &&
        update.satelliteLinks.every(isSatelliteLink)
    );
}

function hasValidTimelineFields(value: unknown): value is {interval: string; timestamp: string} {
    const body = value as {interval: string; timestamp: string};

    return Boolean(
        body &&
        typeof body.interval === 'string' &&
        typeof body.timestamp === 'string'
    );
}

function isSatelliteLinksRequest(value: unknown): value is SatelliteLinksRequest {
    const body = value as SatelliteLinksRequest;

    return Boolean(
        hasValidTimelineFields(body) &&
        (body.type === undefined || body.type === 'satellite') &&
        Array.isArray(body.links) &&
        body.links.every(isSatelliteLinkUpdate)
    );
}

function isLinksRequest(value: unknown): value is LinksRequest {
    return isSatelliteLinksRequest(value);
}

function broadcastLinks(result: LinksRequest | LinksRequest[]) {
    let deadSockets: WebSocket[] = [];
    const message = JSON.stringify({
        type: 'SATELLITE_LINK_UPDATES',
        result,
    });

    satelliteLinkSubscribers.forEach((socket: WebSocket) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(message);
        }

        if (socket.readyState > WebSocket.OPEN) {
            deadSockets.push(socket);
        }
    });

    deadSockets.forEach((socket) => {
        const index = satelliteLinkSubscribers.indexOf(socket);
        if (index !== -1) {
            satelliteLinkSubscribers.splice(index, 1);
        }
    });
}

function getDefaultLinksPath(requestedType: unknown): string | undefined {
    if (requestedType === undefined || requestedType === 'satellite') {
        return defaultLinksPath;
    }

    return undefined;
}

function resolveLinksPath(requestedPath: unknown, requestedType: unknown): string | undefined {
    if (requestedPath === undefined) {
        return getDefaultLinksPath(requestedType);
    }

    if (typeof requestedPath !== 'string' || requestedPath.trim().length === 0) {
        return undefined;
    }

    const resolvedPath = path.resolve(projectDirectory, requestedPath);
    const relativePath = path.relative(linksDirectory, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return undefined;
    }

    return resolvedPath;
}

async function readJsonPayload(filePath: string): Promise<unknown> {
    const source = await fs.readFile(filePath, 'utf8');
    return JSON.parse(source);
}

async function sendJsonFile(res: express.Response, filePath: string, label: string) {
    try {
        res.json({
            ok: true,
            result: await readJsonPayload(filePath),
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            res.status(404).json({
                ok: false,
                result: `${label} file not found: ${filePath}`,
            });
            return;
        }

        if (error instanceof SyntaxError) {
            res.status(500).json({
                ok: false,
                result: `${label} file is not valid JSON: ${filePath}`,
            });
            return;
        }

        throw error;
    }
}

router.get('/planned-shell-orbit', async function (_req, res) {
    await sendJsonFile(res, plannedShellOrbitPath, 'planned shell orbit');
});

router.get('/starlink-gateways', async function (_req, res) {
    await sendJsonFile(res, starlinkGatewaysPath, 'starlink gateways');
});

router.post('/links', linksJsonParser, async function (req, res) {
    const requestBody = req.body;
    if (
        requestBody !== undefined &&
        requestBody !== null &&
        (typeof requestBody !== 'object' || Array.isArray(requestBody))
    ) {
        res.status(400).json({
            ok: false,
            result: 'request body must be an object containing an optional path string and optional type.'
        });
        return;
    }

    const linksPath = resolveLinksPath(requestBody?.path, requestBody?.type);
    if (!linksPath) {
        res.status(400).json({
            ok: false,
            result: 'path must reference a JSON file inside the satellite-emulator-service/tmp directory; type must be satellite or omitted when path is omitted.'
        });
        return;
    }

    let source: string;
    try {
        source = await fs.readFile(linksPath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            res.status(404).json({
                ok: false,
                result: `links file not found: ${linksPath}`
            });
            return;
        }
        throw error;
    }

    let body: unknown;
    try {
        body = JSON.parse(source);
    } catch {
        res.status(400).json({
            ok: false,
            result: `links file is not valid JSON: ${linksPath}`
        });
        return;
    }

    if (!isLinksRequest(body) && (!Array.isArray(body) || !body.every(isLinksRequest))) {
        res.status(400).json({
            ok: false,
            result: 'links file must contain a satellite LinksRequest or LinksRequest array.'
        });
        return;
    }

    broadcastLinks(body);

    res.json({
        ok: true,
        path: linksPath,
    });
});

export function registerWebSocketRoutes() {
    router.ws('/link-updates', async function (ws) {
        satelliteLinkSubscribers.push(ws);
    });
}

export default router;
