import {PassThrough} from 'stream';
import {Sniffer} from '../../../src/utils/sniffer';
import {RuntimeClient} from '../../../src/runtime/types';

describe('Sniffer', () => {
    const originalConcurrency = process.env.SNIFFER_SESSION_CONCURRENCY;

    afterEach(() => {
        if (originalConcurrency === undefined) {
            delete process.env.SNIFFER_SESSION_CONCURRENCY;
        } else {
            process.env.SNIFFER_SESSION_CONCURRENCY = originalConcurrency;
        }
    });

    it('uses canonical node IDs, limits session creation concurrency, and reuses sessions', async () => {
        process.env.SNIFFER_SESSION_CONCURRENCY = '4';
        let active = 0;
        let maximumActive = 0;
        const streams: PassThrough[] = [];

        const runtime = {
            kind: 'docker',
            resolveNodeId: jest.fn(async () => {
                throw new Error('canonical IDs must not be resolved again');
            }),
            openSession: jest.fn(async (nodeId: string) => {
                active += 1;
                maximumActive = Math.max(maximumActive, active);
                await new Promise<void>(resolve => setImmediate(resolve));
                active -= 1;

                const stream = new PassThrough();
                streams.push(stream);
                return {nodeId, stream};
            })
        } as unknown as RuntimeClient;

        const sniffer = new Sniffer(runtime);
        sniffer.getLoggers().forEach(logger => logger.setSettings({minLevel: 'warn'}));
        const nodes = Array.from({length: 20}, (_, index) => `node-${index}`);

        await sniffer.sniff(nodes, '');
        expect(runtime.openSession).not.toHaveBeenCalled();

        await sniffer.sniff(nodes, 'icmp');

        expect(runtime.resolveNodeId).not.toHaveBeenCalled();
        expect(runtime.openSession).toHaveBeenCalledTimes(nodes.length);
        expect(maximumActive).toBeLessThanOrEqual(4);

        await sniffer.sniff(nodes, 'udp');
        expect(runtime.openSession).toHaveBeenCalledTimes(nodes.length);

        streams.forEach(stream => stream.destroy());
    });

    it('reuses sessions when changing filters across 1000 nodes', async () => {
        const streams = new Map<string, PassThrough>();
        const writes = new Map<string, string[]>();
        const runtime = {
            kind: 'docker',
            resolveNodeId: jest.fn(async () => { throw new Error('already resolved'); }),
            openSession: jest.fn(async (nodeId: string) => {
                const stream = new PassThrough();
                streams.set(nodeId, stream);
                const commands: string[] = [];
                writes.set(nodeId, commands);
                stream.on('data', chunk => commands.push(chunk.toString()));
                return {nodeId, stream};
            }),
        } as unknown as RuntimeClient;
        const sniffer = new Sniffer(runtime);
        sniffer.getLoggers().forEach(logger => logger.setSettings({minLevel: 'warn'}));
        const ids = Array.from({length: 1000}, (_, index) => `node-${index}`);

        await sniffer.sniff(ids, 'icmp');
        await sniffer.sniff(ids, 'udp');

        expect(runtime.resolveNodeId).not.toHaveBeenCalled();
        expect(runtime.openSession).toHaveBeenCalledTimes(ids.length);
        expect(writes.size).toBe(ids.length);
        expect(writes.get('node-0')).toEqual(['icmp\r', 'udp\r']);
        expect(writes.get('node-999')).toEqual(['icmp\r', 'udp\r']);
        streams.forEach(stream => stream.destroy());
    });
});
