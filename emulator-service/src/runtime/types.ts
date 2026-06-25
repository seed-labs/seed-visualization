import { Duplex, Readable } from 'stream';

export type RuntimeKind = 'docker' | 'kubernetes';

export interface RuntimeLabels {
    [key: string]: string | undefined;
}

export interface RuntimeNode {
    id: string;
    name: string;
    runtime: RuntimeKind;
    labels: RuntimeLabels;
    status?: string;
    raw?: any;
}

export interface RuntimeNetwork {
    id: string;
    name: string;
    labels: RuntimeLabels;
    raw?: any;
}

export interface RuntimeSession {
    nodeId: string;
    stream: Duplex;
    resize?: (size: { h: number, w: number }) => Promise<void>;
}

export interface RuntimeExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface RuntimeExecOptions {
    tty?: boolean;
    stdin?: boolean;
}

export interface RuntimeClient {
    kind: RuntimeKind;

    listNodes(): Promise<RuntimeNode[]>;
    listNetworks(): Promise<RuntimeNetwork[]>;
    resolveNodeId(idOrPrefix: string): Promise<string>;
    exec(nodeId: string, cmd: string[], options?: RuntimeExecOptions): Promise<RuntimeExecResult>;
    openSession(nodeId: string, cmd: string[], options?: RuntimeExecOptions): Promise<RuntimeSession>;
    copyToNode(source: Readable, nodeId: string, targetPath: string): Promise<void>;
}
