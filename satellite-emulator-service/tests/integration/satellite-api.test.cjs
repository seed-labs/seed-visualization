require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

const satelliteRouter = require('../../src/api/v1/satellite').default;

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({server, baseUrl: `http://127.0.0.1:${address.port}`});
    });
  });
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test('serves static satellite data through the satellite API', async () => {
  const app = express();
  app.use('/satellite', satelliteRouter);
  const {server, baseUrl} = await listen(app);

  try {
    const orbit = await fetch(`${baseUrl}/satellite/planned-shell-orbit`).then((res) => res.json());
    const gateways = await fetch(`${baseUrl}/satellite/starlink-gateways`).then((res) => res.json());

    assert.equal(orbit.ok, true);
    assert.equal(typeof orbit.result, 'object');
    assert.equal(gateways.ok, true);
    assert.equal(Array.isArray(gateways.result) || typeof gateways.result === 'object', true);
  } finally {
    await close(server);
  }
});

test('posts default satellite link file and rejects files outside tmp', async () => {
  const app = express();
  app.use('/satellite', satelliteRouter);
  const {server, baseUrl} = await listen(app);

  try {
    const accepted = await fetch(`${baseUrl}/satellite/links`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({}),
    });
    const acceptedBody = await accepted.json();

    assert.equal(accepted.status, 200);
    assert.equal(acceptedBody.ok, true);

    const rejected = await fetch(`${baseUrl}/satellite/links`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path: '../package.json'}),
    });
    const rejectedBody = await rejected.json();

    assert.equal(rejected.status, 400);
    assert.equal(rejectedBody.ok, false);
  } finally {
    await close(server);
  }
});

test('accepts explicit satellite link files inside tmp', async () => {
  const app = express();
  app.use('/satellite', satelliteRouter);
  const {server, baseUrl} = await listen(app);

  try {
    const accepted = await fetch(`${baseUrl}/satellite/links`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path: 'tmp/links.json', type: 'satellite'}),
    });
    const body = await accepted.json();

    assert.equal(accepted.status, 200);
    assert.equal(body.ok, true);
  } finally {
    await close(server);
  }
});

test('rejects legacy network link requests without reading a default network file', async () => {
  const app = express();
  app.use('/satellite', satelliteRouter);
  const {server, baseUrl} = await listen(app);

  try {
    const rejected = await fetch(`${baseUrl}/satellite/links`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({type: 'network'}),
    });
    const body = await rejected.json();

    assert.equal(rejected.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.result, /type must be satellite or omitted/);
  } finally {
    await close(server);
  }
});

test('rejects malformed link request bodies before reading files', async () => {
  const app = express();
  app.use('/satellite', satelliteRouter);
  const {server, baseUrl} = await listen(app);

  try {
    const rejected = await fetch(`${baseUrl}/satellite/links`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify([]),
    });
    const body = await rejected.json();

    assert.equal(rejected.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.result, /request body must be an object/);
  } finally {
    await close(server);
  }
});
