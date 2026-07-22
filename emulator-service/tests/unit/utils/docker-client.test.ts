import { getDockerEndpointDescription, getDockerOptions } from '../../../src/utils/docker-client';

describe('Docker client configuration', () => {
  it('uses the local Docker daemon by default', () => {
    expect(getDockerOptions({})).toEqual({});
    expect(getDockerEndpointDescription({})).toBe('local Docker daemon');
  });

  it('uses DOCKER_HOST and DOCKER_PORT for remote Docker daemons', () => {
    const env = {
      DOCKER_HOST: 'docker.example.test',
      DOCKER_PORT: '2376',
    };

    expect(getDockerOptions(env)).toEqual({
      host: 'docker.example.test',
      port: 2376,
    });
    expect(getDockerEndpointDescription(env)).toBe('docker.example.test:2376');
  });

  it('parses tcp Docker host URLs', () => {
    expect(getDockerOptions({ DOCKER_HOST: 'tcp://docker.example.test:2376' })).toEqual({
      host: 'docker.example.test',
      port: 2376,
    });
  });

  it('parses http and https Docker host URLs', () => {
    expect(getDockerOptions({ DOCKER_HOST: 'http://127.0.0.1:2375' })).toEqual({
      host: '127.0.0.1',
      port: 2375,
      protocol: 'http',
    });
    expect(getDockerOptions({ DOCKER_HOST: 'https://docker.example.test:2376' })).toEqual({
      host: 'docker.example.test',
      port: 2376,
      protocol: 'https',
    });
  });

  it('uses socket paths when configured', () => {
    expect(getDockerOptions({ DOCKER_SOCKET_PATH: '/var/run/docker.sock' })).toEqual({
      socketPath: '/var/run/docker.sock',
    });
    expect(getDockerOptions({ DOCKER_HOST: 'unix:///var/run/docker.sock' })).toEqual({
      socketPath: '/var/run/docker.sock',
    });
  });
});
