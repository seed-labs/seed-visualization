import { loadBackendEnv } from '../config/env';
import { DockerRuntimeClient } from './docker-runtime';
import { KubernetesRuntimeClient } from './k8s-runtime';
import { RuntimeClient } from './types';

loadBackendEnv();

export function getRuntimeEndpointDescription(env: NodeJS.ProcessEnv = process.env): string {
    const runtime = (env.RUNTIME_BACKEND || 'docker').toLowerCase();

    if (runtime === 'kubernetes' || runtime === 'k8s') {
        return `${env.K8S_NAMESPACE || 'default'} namespace${env.K8S_CONTEXT ? ` on ${env.K8S_CONTEXT}` : ''}`;
    }

    if (env.DOCKER_SOCKET_PATH) return env.DOCKER_SOCKET_PATH;
    if (env.DOCKER_HOST) return env.DOCKER_PORT ? `${env.DOCKER_HOST}:${env.DOCKER_PORT}` : env.DOCKER_HOST;
    return 'local Docker daemon';
}

export function createRuntimeClient(env: NodeJS.ProcessEnv = process.env): RuntimeClient {
    const runtime = (env.RUNTIME_BACKEND || 'docker').toLowerCase();

    if (runtime === 'kubernetes' || runtime === 'k8s') {
        return new KubernetesRuntimeClient({
            namespace: env.K8S_NAMESPACE || 'default',
            kubeconfig: env.KUBECONFIG,
            labelSelector: env.K8S_LABEL_SELECTOR || env.SEED_LABEL_SELECTOR || ''
        });
    }

    return new DockerRuntimeClient(env);
}
