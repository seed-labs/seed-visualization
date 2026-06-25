import { Duplex, PassThrough, Readable } from 'stream';
import {
    RuntimeClient,
    RuntimeExecOptions,
    RuntimeExecResult,
    RuntimeNetwork,
    RuntimeNode,
    RuntimeSession
} from './types';

interface KubernetesRuntimeOptions {
    namespace: string;
    kubeconfig?: string;
    labelSelector?: string;
}

function loadKubernetesClient(): any {
    try {
        return require('@kubernetes/client-node');
    } catch (error) {
        throw new Error('Kubernetes runtime requires @kubernetes/client-node. Install it before setting RUNTIME_BACKEND=kubernetes.');
    }
}

export class KubernetesRuntimeClient implements RuntimeClient {
    kind = 'kubernetes' as const;
    private _namespace: string;
    private _labelSelector: string;
    private _coreApi: any;
    private _execApi: any;

    constructor(options: KubernetesRuntimeOptions) {
        const k8s = loadKubernetesClient();
        const kubeConfig = new k8s.KubeConfig();

        if (options.kubeconfig) {
            kubeConfig.loadFromFile(options.kubeconfig);
        } else {
            kubeConfig.loadFromDefault();
        }

        this._namespace = options.namespace;
        this._labelSelector = options.labelSelector || '';
        this._coreApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
        this._execApi = new k8s.Exec(kubeConfig);
    }

    async listNodes(): Promise<RuntimeNode[]> {
        const result = await this._coreApi.listNamespacedPod({
            namespace: this._namespace,
            labelSelector: this._labelSelector || undefined
        });

        return result.items.map((pod: any) => ({
            id: `${pod.metadata?.namespace || this._namespace}/${pod.metadata?.name}`,
            name: pod.metadata?.name || '',
            runtime: this.kind,
            labels: pod.metadata?.labels || {},
            status: pod.status?.phase,
            raw: pod
        }));
    }

    async listNetworks(): Promise<RuntimeNetwork[]> {
        return [];
    }

    async resolveNodeId(idOrPrefix: string): Promise<string> {
        const nodes = await this.listNodes();
        const candidates = nodes.filter(node => node.id.startsWith(idOrPrefix) || node.name.startsWith(idOrPrefix));

        if (candidates.length != 1) {
            throw new Error(`no match or multiple match for node ID ${idOrPrefix}`);
        }

        return candidates[0].id;
    }

    async exec(nodeId: string, cmd: string[], options: RuntimeExecOptions = {}): Promise<RuntimeExecResult> {
        const {namespace, pod} = this._parseNodeId(nodeId);
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const stdin = new PassThrough();
        let out = '';
        let err = '';
        let exitCode = 0;

        stdout.on('data', chunk => out += chunk.toString('utf8'));
        stderr.on('data', chunk => err += chunk.toString('utf8'));

        const connection = await this._execApi.exec(
            namespace,
            pod,
            undefined,
            cmd,
            stdout,
            stderr,
            stdin,
            options.tty === true,
            (status: any) => {
                if (status?.status === 'Failure') {
                    exitCode = 1;
                }
            }
        );

        await new Promise<void>(resolve => connection.on('close', resolve));

        return {
            exitCode,
            stdout: out,
            stderr: err
        };
    }

    async openSession(nodeId: string, cmd: string[], options: RuntimeExecOptions = {}): Promise<RuntimeSession> {
        const {namespace, pod} = this._parseNodeId(nodeId);
        const stdin = new PassThrough();
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const stream = new Duplex({
            write(chunk, encoding, callback) {
                stdin.write(chunk, encoding, callback);
            },
            read() {
            },
            final(callback) {
                stdin.end();
                callback();
            }
        });

        stdout.on('data', chunk => stream.push(chunk));
        stderr.on('data', chunk => stream.push(chunk));
        stdout.on('end', () => stream.push(null));
        stderr.on('end', () => stream.push(null));

        await this._execApi.exec(
            namespace,
            pod,
            undefined,
            cmd,
            stdout,
            stderr,
            stdin,
            options.tty ?? true
        );

        return {
            nodeId,
            stream
        };
    }

    async copyToNode(source: Readable, nodeId: string, targetPath: string): Promise<void> {
        const session = await this.openSession(nodeId, ['tar', '-x', '-C', targetPath], {stdin: true});
        source.pipe(session.stream);
    }

    private _parseNodeId(nodeId: string): { namespace: string, pod: string } {
        if (nodeId.includes('/')) {
            const [namespace, pod] = nodeId.split('/');
            return {namespace, pod};
        }

        return {
            namespace: this._namespace,
            pod: nodeId
        };
    }
}
