import WebSocket from 'ws';
import express from 'express';

let satelliteGroundLinkSubscribers: WebSocket[] = [];
const router = express.Router();
const groundLinksJsonParser = express.json({
    limit: process.env.GROUND_LINKS_BODY_LIMIT || '50mb',
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

function broadcastGroundLinks(result: GroundLinksRequest | GroundLinksRequest[]) {
    let deadSockets: WebSocket[] = [];

    satelliteGroundLinkSubscribers.forEach((socket: WebSocket) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'SATELLITE_GROUND_LINKS',
                result,
            }));
        }

        if (socket.readyState > WebSocket.OPEN) {
            deadSockets.push(socket);
        }
    });

    deadSockets.forEach((socket) => {
        const index = satelliteGroundLinkSubscribers.indexOf(socket);
        if (index !== -1) {
            satelliteGroundLinkSubscribers.splice(index, 1);
        }
    });
}

router.post('/ground-links', groundLinksJsonParser, async function (req, res, next) {
    const body = req.body;

    if (!isGroundLinksRequest(body) && (!Array.isArray(body) || !body.every(isGroundLinksRequest))) {
        res.status(400).json({
            ok: false,
            result: 'request body must be a GroundLinksRequest or GroundLinksRequest array.'
        });
        next();
        return;
    }

    broadcastGroundLinks(body);

    res.json({
        ok: true,
    });

    next();
});

router.ws('/ground-links', async function (ws, req, next) {
    satelliteGroundLinkSubscribers.push(ws);
    next();
});

export = router;
