import Dockerode from 'dockerode';
import { Readable, Writable } from 'stream';
import { getDockerOptions } from '../utils/docker-client';
import {
    RuntimeClient,
    RuntimeExecOptions,
    RuntimeExecResult,
    RuntimeNetwork,
    RuntimeNode,
    RuntimeSession
} from './types';

class StringWritable extends Writable {
    private _chunks: string[] = [];

    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        this._chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
        callback();
    }

    toString(): string {
        return this._chunks.join('');
    }
}

export class DockerRuntimeClient implements RuntimeClient {
    kind = 'docker' as const;
    private _docker: Dockerode;

    constructor(env: NodeJS.ProcessEnv = process.env) {
        const options = getDockerOptions(env);
        this._docker = Object.keys(options).length > 0 ? new Dockerode(options) : new Dockerode();
    }

    async listNodes(): Promise<RuntimeNode[]> {
        const containers = await this._docker.listContainers();

        return containers.map(container => ({
            id: container.Id,
            name: container.Names?.[0]?.replace(/^\//, '') || container.Id,
            runtime: this.kind,
            labels: container.Labels || {},
            status: container.State,
            raw: container
        }));
    }

    async listNetworks(): Promise<RuntimeNetwork[]> {
        const networks = await this._docker.listNetworks();

        return networks.map(network => ({
            id: network.Id,
            name: network.Name,
            labels: network.Labels || {},
            raw: network
        }));
    }

    async resolveNodeId(idOrPrefix: string): Promise<string> {
        const nodes = await this.listNodes();
        const candidates = nodes.filter(node => node.id.startsWith(idOrPrefix));

        if (candidates.length != 1) {
            throw new Error(`no match or multiple match for node ID ${idOrPrefix}`);
        }

        return candidates[0].id;
    }

    async exec(nodeId: string, cmd: string[], options: RuntimeExecOptions = {}): Promise<RuntimeExecResult> {
        const container = this._docker.getContainer(nodeId);
        const exec = await container.exec({
            Cmd: cmd,
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: options.stdin === true,
            Tty: options.tty === true
        });
        const stream = await exec.start({hijack: true, stdin: options.stdin === true});
        const stdout = new StringWritable();
        const stderr = new StringWritable();

        await new Promise<void>((resolve, reject) => {
            if (options.tty) {
                stream.on('data', chunk => stdout.write(chunk));
            } else {
                this._docker.modem.demuxStream(stream, stdout, stderr);
            }

            stream.on('end', resolve);
            stream.on('error', reject);
        });

        const inspect = await exec.inspect();

        return {
            exitCode: inspect.ExitCode ?? 0,
            stdout: stdout.toString(),
            stderr: stderr.toString()
        };
    }

    async openSession(nodeId: string, cmd: string[], options: RuntimeExecOptions = {}): Promise<RuntimeSession> {
        const container = this._docker.getContainer(nodeId);
        const exec = await container.exec({
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: options.tty ?? true,
            Cmd: cmd
        });
        const stream = await exec.start({
            Tty: options.tty ?? true,
            Detach: false,
            stdin: true,
            hijack: true
        });

        return {
            nodeId,
            stream,
            resize: async size => {
                await exec.resize(size);
            }
        };
    }

    async copyToNode(source: Readable, nodeId: string, targetPath: string): Promise<void> {
        const container = this._docker.getContainer(nodeId);
        await container.putArchive(source, {
            path: targetPath,
            noOverwriteDirNonDir: false
        });
    }
}
