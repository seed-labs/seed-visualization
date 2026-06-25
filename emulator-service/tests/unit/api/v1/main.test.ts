import express from 'express';
import expressWs from 'express-ws';
import request from 'supertest';
import { containerFixture, networkFixture, nonSeedContainerFixture } from '../../../fixtures/docker';

const dockerMock = {
  listContainers: jest.fn(),
  listNetworks: jest.fn(),
};
const hasSession = jest.fn().mockReturnValue(false);
const isNetworkConnected = jest.fn();
const setNetworkConnected = jest.fn();
const sniff = jest.fn();
const submitEvent = jest.fn();

jest.mock('../../../../src/utils/socket-handler', () => ({
  SocketHandler: jest.fn().mockImplementation(() => ({
    getSessionManager: () => ({ hasSession }),
    getLoggers: () => [{ setSettings: jest.fn() }],
    handleSession: jest.fn(),
  })),
}));
jest.mock('../../../../src/utils/controller', () => ({
  Controller: jest.fn().mockImplementation(() => ({
    isNetworkConnected,
    setNetworkConnected,
    listBgpPeers: jest.fn(),
    setBgpPeerState: jest.fn(),
    getLoggers: () => [{ setSettings: jest.fn() }],
  })),
}));
jest.mock('../../../../src/utils/sniffer', () => ({
  Sniffer: jest.fn().mockImplementation(() => ({
    setListener: jest.fn(),
    setCapturePacketListener: jest.fn(),
    sniff,
    getLoggers: () => [{ setSettings: jest.fn() }],
  })),
}));
jest.mock('../../../../src/utils/submit-event', () => ({
  SubmitEvent: jest.fn().mockImplementation(() => ({
    submitEvent,
  })),
}));
jest.mock('../../../../src/utils/plugin-manager', () => ({
  PluginManager: jest.fn().mockImplementation(() => ({
    plugins: ['submit_event'],
  })),
}));
jest.mock('dockerode', () => jest.fn(() => dockerMock));

function createTestApp() {
  const app = express();
  expressWs(app);
  const apiV1Router = require('../../../../src/api/v1/main');
  app.use('/api/v1', apiV1Router);
  return app;
}

describe('api v1 router', () => {
  const app = createTestApp();

  beforeEach(() => {
    jest.clearAllMocks();
    hasSession.mockReturnValue(false);
  });

  it('returns seed containers and filters non-seed containers', async () => {
    dockerMock.listContainers.mockResolvedValue([containerFixture, nonSeedContainerFixture]);

    const response = await request(app).get('/api/v1/container').expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.result).toHaveLength(1);
    expect(response.body.result[0].meta.emulatorInfo.name).toBe('router-a');
  });

  it('returns api failure when docker listContainers fails', async () => {
    dockerMock.listContainers.mockRejectedValue(new Error('docker unavailable'));

    const response = await request(app).get('/api/v1/container').expect(200);

    expect(response.body).toEqual({
      ok: false,
      result: 'Error: docker unavailable',
    });
  });

  it('returns parameter error when a container id has no unique match', async () => {
    dockerMock.listContainers.mockResolvedValue([containerFixture]);

    const response = await request(app).get('/api/v1/container/missing').expect(200);

    expect(response.body.ok).toBe(false);
    expect(response.body.result).toContain('no match or multiple match');
  });

  it('returns network metadata from docker networks', async () => {
    dockerMock.listNetworks.mockResolvedValue([networkFixture, { Id: 'other', Labels: {} }]);

    const response = await request(app).get('/api/v1/network').expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.result).toHaveLength(1);
    expect(response.body.result[0].meta.emulatorInfo.name).toBe('net0');
  });

  it('returns docker-controlled network status for a matched container', async () => {
    dockerMock.listContainers.mockResolvedValue([containerFixture]);
    isNetworkConnected.mockResolvedValue(true);

    const response = await request(app).get('/api/v1/container/node-123/net').expect(200);

    expect(response.body).toEqual({ ok: true, result: true });
    expect(isNetworkConnected).toHaveBeenCalledWith(containerFixture.Id);
  });

  it('passes body params to network status changes', async () => {
    dockerMock.listContainers.mockResolvedValue([containerFixture]);

    const response = await request(app)
      .post('/api/v1/container/node-123/net')
      .send({ status: false })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(setNetworkConnected).toHaveBeenCalledWith(containerFixture.Id, false);
  });

  it('returns parameter error for packet capture without node id or name', async () => {
    dockerMock.listContainers.mockResolvedValue([containerFixture]);

    const response = await request(app).post('/api/v1/packet').send({}).expect(200);

    expect(response.body.ok).toBe(false);
    expect(response.body.result).toContain('does not exist');
    expect(sniff).not.toHaveBeenCalled();
  });
});
