import express from 'express';
import expressWs from 'express-ws';

const app = express();
const wsInstance = expressWs(app);

import apiV1Router, {registerWebSocketRoutes, satelliteRouter} from './api/v1/main';
import {errorHandler, notFoundHandler} from './middleware/error-handler';

wsInstance.applyTo(satelliteRouter);
registerWebSocketRoutes();

app.use('/api/v1', apiV1Router);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(9091, '0.0.0.0');
