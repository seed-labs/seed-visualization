import WebSocket from 'ws';
import express from 'express';
import {promises as fs} from 'fs';
import path from 'path';

let satelliteLinkSubscribers: WebSocket[] = [];
const router = express.Router();
const linksJsonParser = express.json({
    limit: '10kb',
});
const projectDirectory = path.resolve(__dirname, '../../../../..');
const linksDirectory = path.join(projectDirectory, 'tmp');
const defaultLinksPath = path.join(linksDirectory, 'links.json');

interface GroundLink {
    groundStationId: string;
    satelliteId: string;
}

interface SatelliteLink {
    satelliteAId: string;
    satelliteBId: string;
}

interface LinkUpdate {
    groundLinks: GroundLink[];
    satelliteLinks: SatelliteLink[];
}

interface LinksRequest {
    interval: string;
    links: LinkUpdate[];
    timestamp: string;
}

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

function isLinkUpdate(value: unknown): value is LinkUpdate {
    const update = value as LinkUpdate;

    return Boolean(
        update &&
        Array.isArray(update.groundLinks) &&
        update.groundLinks.every(isGroundLink) &&
        Array.isArray(update.satelliteLinks) &&
        update.satelliteLinks.every(isSatelliteLink)
    );
}

function isLinksRequest(value: unknown): value is LinksRequest {
    const body = value as LinksRequest;

    return Boolean(
        body &&
        typeof body.interval === 'string' &&
        typeof body.timestamp === 'string' &&
        Array.isArray(body.links) &&
        body.links.every(isLinkUpdate)
    );
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

function resolveLinksPath(requestedPath: unknown): string | undefined {
    if (requestedPath === undefined) {
        return defaultLinksPath;
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

router.post('/links', linksJsonParser, async function (req, res) {
    const requestBody = req.body;
    if (
        requestBody !== undefined &&
        requestBody !== null &&
        (typeof requestBody !== 'object' || Array.isArray(requestBody))
    ) {
        res.status(400).json({
            ok: false,
            result: 'request body must be an object containing an optional path string.'
        });
        return;
    }

    const linksPath = resolveLinksPath(requestBody?.path);
    if (!linksPath) {
        res.status(400).json({
            ok: false,
            result: 'path must reference a JSON file inside the satellite-emulator/tmp directory.'
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
            result: 'links file must contain a LinksRequest or LinksRequest array.'
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
