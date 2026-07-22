import fs from 'fs';
import os from 'os';
import path from 'path';

describe('backend environment loader', () => {
  const originalEnv = process.env;
  let envDir: string;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.CONSOLE;
    delete process.env.DOCKER_HOST;
    delete process.env.DOCKER_PORT;
    delete process.env.BACKEND_ENV;
    delete process.env.BACKEND_ENV_DIR;

    envDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-env-'));
    fs.writeFileSync(path.join(envDir, '.env'), 'CONSOLE=base\n');
    fs.writeFileSync(path.join(envDir, '.env.development'), 'CONSOLE=true\nDOCKER_HOST=127.0.0.1\n');
    fs.writeFileSync(path.join(envDir, '.env.production'), 'CONSOLE=false\nDOCKER_HOST=prod-docker\n');
    process.env.BACKEND_ENV_DIR = envDir;
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(envDir, { recursive: true, force: true });
  });

  it('loads development env by default', () => {
    const { loadBackendEnv } = require('../../../src/config/env');

    loadBackendEnv();

    expect(process.env.CONSOLE).toBe('true');
    expect(process.env.DOCKER_HOST).toBe('127.0.0.1');
  });

  it('loads development env while running under Jest NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    const { loadBackendEnv } = require('../../../src/config/env');

    loadBackendEnv();

    expect(process.env.CONSOLE).toBe('true');
    expect(process.env.DOCKER_HOST).toBe('127.0.0.1');
  });

  it('loads production env when BACKEND_ENV is production', () => {
    process.env.BACKEND_ENV = 'production';
    const { loadBackendEnv } = require('../../../src/config/env');

    loadBackendEnv();

    expect(process.env.CONSOLE).toBe('false');
    expect(process.env.DOCKER_HOST).toBe('prod-docker');
  });

  it('keeps real environment variables over file values', () => {
    process.env.CONSOLE = 'already-set';
    process.env.BACKEND_ENV = 'production';
    const { loadBackendEnv } = require('../../../src/config/env');

    loadBackendEnv();

    expect(process.env.CONSOLE).toBe('already-set');
  });

  it('configures the checked-in development Docker endpoint', () => {
    delete process.env.BACKEND_ENV_DIR;
    process.env.BACKEND_ENV = 'development';
    const { loadBackendEnv } = require('../../../src/config/env');

    loadBackendEnv();

    expect(process.env.DOCKER_HOST).toBe('192.168.23.128');
    expect(process.env.DOCKER_PORT).toBe('2375');
  });
});
