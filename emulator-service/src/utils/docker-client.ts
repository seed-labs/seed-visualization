import Dockerode from 'dockerode';
import { loadBackendEnv } from '../config/env';

loadBackendEnv();

export function getDockerEndpointDescription(env: NodeJS.ProcessEnv = process.env): string {
    if (env.DOCKER_SOCKET_PATH) return env.DOCKER_SOCKET_PATH;
    if (env.DOCKER_HOST) return env.DOCKER_PORT ? `${env.DOCKER_HOST}:${env.DOCKER_PORT}` : env.DOCKER_HOST;
    return 'local Docker daemon';
}

function parseDockerHost(host: string, port?: string): Dockerode.DockerOptions {
    const value = host.trim();
    if (!value) return {};

    if (value.startsWith('unix://')) {
        return {socketPath: value.replace('unix://', '')};
    }

    if (value.startsWith('npipe://')) {
        return {socketPath: value};
    }

    const urlValue = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value) ? value : `tcp://${value}`;
    const url = new URL(urlValue);
    const protocol = url.protocol.replace(':', '');
    const options: Dockerode.DockerOptions = {
        host: url.hostname,
    };

    const resolvedPort = port ?? url.port;
    if (resolvedPort) options.port = Number.parseInt(resolvedPort, 10);
    if (protocol === 'http' || protocol === 'https' || protocol === 'ssh') options.protocol = protocol;

    return options;
}

export function getDockerOptions(env: NodeJS.ProcessEnv = process.env): Dockerode.DockerOptions {
    if (env.DOCKER_SOCKET_PATH) return {socketPath: env.DOCKER_SOCKET_PATH};
    if (!env.DOCKER_HOST) return {};
    return parseDockerHost(env.DOCKER_HOST, env.DOCKER_PORT);
}

export function createDockerClient(env: NodeJS.ProcessEnv = process.env): Dockerode {
    const options = getDockerOptions(env);
    return Object.keys(options).length > 0 ? new Dockerode(options) : new Dockerode();
}
