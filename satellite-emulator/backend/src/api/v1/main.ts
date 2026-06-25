import express from 'express';
import {SocketHandler} from '../../utils/socket-handler';
import dockerode from 'dockerode';
import {SeedContainerInfo, Emulator, SeedNetInfo} from '../../utils/seedemu-meta';
import {Sniffer} from '../../utils/sniffer';
import {SubmitEvent} from '../../utils/submit-event';
import {PluginManager} from '../../utils/plugin-manager';
import WebSocket from 'ws';
import {Controller} from '../../utils/controller';
import satelliteRouter from './satellite/index';

const router = express.Router();

router.use('/satellite', satelliteRouter);
export = router;
