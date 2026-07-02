import WebSocket from 'ws';
import express from 'express';

let satelliteLinkSubscribers: WebSocket[] = [];
const router = express.Router();
const linksJsonParser = express.json({
    limit: process.env.GROUND_LINKS_BODY_LIMIT || '100mb',
});

interface GroundLink {
    groundStationId?: string;
    satelliteId?: string;
}


interface GroundLinksRequest {
    interval: string,
    groundLinks: GroundLink[][],
    timestamp: string
}

interface SatelliteLink {
    satelliteAId: string;
    satelliteBId: string;
}

interface SatelliteLinksRequest {
    interval: string;
    satelliteLinks: SatelliteLink[][];
    timestamp: string;
}

function isGroundLink(value: unknown): value is GroundLink {
    const link = value as GroundLink;

    return Boolean(
        link &&
        (link.groundStationId === undefined || typeof link.groundStationId === 'string') &&
        (link.satelliteId === undefined || typeof link.satelliteId === 'string')
    );
}

function isGroundLinksRequest(value: unknown): value is GroundLinksRequest {
    const body = value as GroundLinksRequest;

    return Boolean(
        body &&
        typeof body.interval === 'string' &&
        typeof body.timestamp === 'string' &&
        Array.isArray(body.groundLinks) &&
        body.groundLinks.every((links) => Array.isArray(links) && links.every(isGroundLink))
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

function isSatelliteLinksRequest(value: unknown): value is SatelliteLinksRequest {
    const body = value as SatelliteLinksRequest;

    return Boolean(
        body &&
        typeof body.interval === 'string' &&
        typeof body.timestamp === 'string' &&
        Array.isArray(body.satelliteLinks) &&
        body.satelliteLinks.every((links) => Array.isArray(links) && links.every(isSatelliteLink))
    );
}

function broadcastLinks(
    type: 'SATELLITE_GROUND_LINKS' | 'SATELLITE_LINKS',
    result: GroundLinksRequest | GroundLinksRequest[] | SatelliteLinksRequest | SatelliteLinksRequest[]
) {
    let deadSockets: WebSocket[] = [];

    satelliteLinkSubscribers.forEach((socket: WebSocket) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type,
                result,
            }));
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

router.post('/ground-links', linksJsonParser, async function (req, res) {
    const body = req.body;

    if (!isGroundLinksRequest(body) && (!Array.isArray(body) || !body.every(isGroundLinksRequest))) {
        res.status(400).json({
            ok: false,
            result: 'request body must be a GroundLinksRequest or GroundLinksRequest array.'
        });
        return;
    }

    broadcastLinks('SATELLITE_GROUND_LINKS', body);

    res.json({
        ok: true,
    });

});

router.post('/satellite-links', linksJsonParser, async function (req, res) {
    const body = req.body;

    if (!isSatelliteLinksRequest(body) && (!Array.isArray(body) || !body.every(isSatelliteLinksRequest))) {
        res.status(400).json({
            ok: false,
            result: 'request body must be a SatelliteLinksRequest or SatelliteLinksRequest array.'
        });
        return;
    }

    broadcastLinks('SATELLITE_LINKS', body);

    res.json({
        ok: true,
    });

});

export function registerWebSocketRoutes() {
    router.ws('/link-updates', async function (ws) {
        satelliteLinkSubscribers.push(ws);
    });
}

export default router;
