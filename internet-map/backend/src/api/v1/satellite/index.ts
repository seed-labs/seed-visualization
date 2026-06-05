import WebSocket from 'ws';
import express from 'express';
import {generateOrbitPoints} from "../../../utils/satellite";

let satelliteSubscribers: WebSocket[] = [];
const router = express.Router();

router.post('/lines', express.json(), async function (req, res, next) {
    let ret
    let deadSockets: WebSocket[] = [];
    const id = req.body.id
    const name = req.body.name
    const line1 = req.body.line1
    const line2 = req.body.line2
    const satellites = req.body.satellites
    const {points} = generateOrbitPoints(line1, line2);
    satelliteSubscribers.forEach((socket: WebSocket) => {
        if (socket.readyState == 1 && points.length) {
            socket.send(JSON.stringify({
                id,
                name,
                satellites,
                track: points,
                color: "rgba(0, 191, 255, 0.95)",
                linkColor: "#25c7ff",
                speed: 0.035,
            }));
        }

        if (socket.readyState > 1) {
            deadSockets.push(socket);
        }
    });

    deadSockets.forEach(socket => satelliteSubscribers.splice(satelliteSubscribers.indexOf(socket), 1));

    if (points.length) {
        ret = {
            ok: true,
            result: "success"
        }
    } else {
        ret = {
            ok: false,
            result: "error"
        }
    }
    res.json(ret);

    next();
});

router.ws('/', async function (ws, req, next) {
    satelliteSubscribers.push(ws);
    next();
});

export = router;