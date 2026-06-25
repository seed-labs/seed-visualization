import express, { Request, Response } from 'express';
import path from 'path';
import expressWs from 'express-ws';

const app = express();
expressWs(app);

import apiV1Router from './api/v1/main';

app.use('/api/v1', apiV1Router);

app.listen(9091, '0.0.0.0');