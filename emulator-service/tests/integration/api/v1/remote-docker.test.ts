import express from 'express';
import expressWs from 'express-ws';
import request from 'supertest';
import { getDockerEndpointDescription } from '../../../../src/utils/docker-client';

const MISSING_CONTAINER_ID = 'missing-integration-container-id';
const UNKNOWN_PLUGIN = '__integration_unknown_plugin__';
const UNKNOWN_NODE_NAME = '__integration_unknown_node__';
const runSessionTests = process.env.RUN_REMOTE_DOCKER_SESSION_TESTS === 'true';
const sessionIt = runSessionTests ? it : it.skip;
const runMutationTests = process.env.RUN_REMOTE_DOCKER_MUTATION_TESTS === 'true';
const mutationIt = runMutationTests ? it : it.skip;

function createTestApp() {
  const app = express();
  expressWs(app);
  const apiV1Router = require('../../../../src/api/v1/main');
  app.use('/api/v1', apiV1Router);
  return app;
}

describe('api v1 remote Docker integration', () => {
  const app = createTestApp();
  let seedContainers: any[] = [];
  let primaryContainer: any;

  beforeAll(async () => {
    const response = await request(app).get('/api/v1/container').expect(200);

    if (!response.body.ok) {
      throw new Error(
        `Remote Docker container probe failed: ${response.body.result}. ` +
          `Start the SEED emulator containers and verify ${getDockerEndpointDescription()} is reachable.`,
      );
    }

    seedContainers = response.body.result;
    if (!Array.isArray(seedContainers) || seedContainers.length === 0) {
      throw new Error(
        'Remote Docker container probe returned no SEED emulator containers. ' +
          'Start the emulator first; /api/v1/container must return at least one labeled SEED container.',
      );
    }

    primaryContainer = seedContainers[0];
  }, 15000);

  it('returns runtime frontend environment', async () => {
    const response = await request(app).get('/api/v1/env.js').expect(200);

    expect(response.headers['content-type']).toContain('application/javascript');
    expect(response.text).toContain('window.__ENV__');
  });

  it('requests containers from the configured remote Docker daemon', async () => {
    const response = await request(app).get('/api/v1/container').expect(200);

    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.result)).toBe(true);
    expect(response.body.result.length).toBeGreaterThan(0);
    expect(response.body.result[0].meta.emulatorInfo.name).toBeTruthy();
  }, 15000);

  it('requests networks from the configured remote Docker daemon', async () => {
    const response = await request(app).get('/api/v1/network').expect(200);

    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.result)).toBe(true);
  }, 15000);

  it('returns configured plugin list', async () => {
    const response = await request(app).get('/api/v1/install').expect(200);

    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.result)).toBe(true);
  });

  it('requests a specific container from the configured remote Docker daemon', async () => {
    const response = await request(app)
      .get(`/api/v1/container/${primaryContainer.Id}`)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.result.Id).toBe(primaryContainer.Id);
    expect(response.body.result.meta.emulatorInfo.name).toBeTruthy();
  }, 15000);

  it('returns an error when a requested container does not exist', async () => {
    const response = await request(app)
      .get(`/api/v1/container/${MISSING_CONTAINER_ID}`)
      .expect(200);

    expect(response.body.ok).toBe(false);
    expect(response.body.result).toContain('no match or multiple match');
  }, 15000);

  it('returns an error for network status when the container id is invalid', async () => {
    const response = await request(app)
      .get(`/api/v1/container/${MISSING_CONTAINER_ID}/net`)
      .expect(200);

    expect(response.body.ok).toBe(false);
    expect(response.body.result).toContain('no match or multiple match');
  }, 15000);

  it('does not change network status when the container id is invalid', async () => {
    const response = await request(app)
      .post(`/api/v1/container/${MISSING_CONTAINER_ID}/net`)
      .send({ status: false })
      .expect(200);

    expect(response.body.ok).toBe(false);
    expect(response.body.result).toContain('no match or multiple match');
  }, 15000);

  it('broadcasts visualization changes for a real remote Docker container', async () => {
    const response = await request(app)
      .post('/api/v1/container/vis/set')
      .query({ id: primaryContainer.Id, action: 'highlight' })
      .send({ highlight: { borderWidth: 4 } })
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      result: { currentFilter: 'success' },
    });
  }, 15000);

  it('rejects unknown plugin install requests after querying the remote containers', async () => {
    const response = await request(app)
      .post('/api/v1/install')
      .send({ name: UNKNOWN_PLUGIN })
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      result: 'install error',
    });
  }, 15000);

  it('accepts unknown plugin uninstall requests without touching container files', async () => {
    const response = await request(app)
      .post('/api/v1/uninstall')
      .send({ name: UNKNOWN_PLUGIN })
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      result: 'uninstall success',
    });
  }, 15000);

  it('returns the current sniffer filter', async () => {
    const response = await request(app).get('/api/v1/sniff').expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.result).toHaveProperty('currentFilter');
  });

  it('broadcasts host events through the API endpoint', async () => {
    const response = await request(app)
      .post('/api/v1/host')
      .send({ id: 'integration-host-event', status: 'ok' })
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      result: '',
    });
  });

  it('returns an error for BGP peer listing when the container id is invalid', async () => {
    const response = await request(app)
      .get(`/api/v1/container/${MISSING_CONTAINER_ID}/bgp`)
      .expect(200);

    expect(response.body.ok).toBe(false);
    expect(response.body.result).toContain('no match or multiple match');
  }, 15000);

  it('does not change BGP peer state when the container id is invalid', async () => {
    const response = await request(app)
      .post(`/api/v1/container/${MISSING_CONTAINER_ID}/bgp/integration-peer`)
      .send({ status: false })
      .expect(200);

    expect(response.body.ok).toBe(false);
    expect(response.body.result).toContain('no match or multiple match');
  }, 15000);

  it('returns an error for packet capture when the target node does not exist', async () => {
    const response = await request(app)
      .post('/api/v1/packet')
      .send({ nodeName: UNKNOWN_NODE_NAME, filter: '' })
      .expect(200);

    expect(response.body.ok).toBe(false);
    expect(response.body.result).toContain('does not exist');
  }, 15000);

  sessionIt('queries network status through a real remote Docker container', async () => {
    const response = await request(app)
      .get(`/api/v1/container/${primaryContainer.Id}/net`)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(typeof response.body.result).toBe('boolean');
  }, 15000);

  sessionIt('starts sniffer sessions against the configured remote Docker daemon', async () => {
    const response = await request(app)
      .post('/api/v1/sniff')
      .send({ filter: '' })
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      result: { currentFilter: '' },
    });
  }, 15000);

  sessionIt('captures packets for a real remote Docker container', async () => {
    const response = await request(app)
      .post('/api/v1/packet')
      .send({ nodeId: primaryContainer.Id, filter: '' })
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      result: { currentPacketFilter: '' },
    });
  }, 15000);

  mutationIt('temporarily changes network status for a real remote Docker container', async () => {
    await request(app)
      .post(`/api/v1/container/${primaryContainer.Id}/net`)
      .send({ status: false })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });

    await request(app)
      .post(`/api/v1/container/${primaryContainer.Id}/net`)
      .send({ status: true })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });
  }, 30000);
});
