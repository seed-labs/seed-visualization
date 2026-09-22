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
});
