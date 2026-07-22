import express, { Request, Response } from 'express';
import expressWs from 'express-ws';

const app = express();
expressWs(app);

import apiV1Router from './api/v1/main';

app.use('/api/v1', apiV1Router);

app.listen(8081, '0.0.0.0');