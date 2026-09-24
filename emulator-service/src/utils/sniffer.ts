import { LogProducer } from '../interfaces/log-producer';
import { Logger } from 'tslog';
import { SessionManager, Session } from './session-manager';
import { RuntimeClient } from '../runtime/types';

export class Sniffer implements LogProducer {
    private static readonly DEFAULT_SESSION_CONCURRENCY = 32;
    private _logger: Logger;
    private _listener: (nodeId: string, stdout: any) => void;
    private _capturePacketListener: (nodeId: string) => void;
    private _sessionManager: SessionManager;

    constructor(runtime: RuntimeClient) {
        this._logger = new Logger({ name: 'Sniffer' });
        this._sessionManager = new SessionManager(runtime, 'Sniffer');
        this._sessionManager.on('new_session', this._listenTo.bind(this));
    }

    private _listenTo(nodeId: string, session: Session) {
        this._logger.debug(`got new session for noed ${nodeId}; attaching listener...`);

        session.stream.addListener('data', data => {
            if (this._listener) {
                this._listener(nodeId, data);
            }
            if (this._capturePacketListener) {
                this._capturePacketListener(nodeId);
            }
        });
    }

    async sniff(nodes: string[], expr: string) {
        this._logger.debug(`sniffing on ${nodes.length} nodes with expr ${expr}...`);

        const configured = Number.parseInt(process.env.SNIFFER_SESSION_CONCURRENCY || '', 10);
        const concurrency = Number.isFinite(configured) && configured > 0
            ? configured : Sniffer.DEFAULT_SESSION_CONCURRENCY;
        let nextNode = 0;
        let firstError: unknown;
        const worker = async () => {
            while (nextNode < nodes.length) {
                const node = nodes[nextNode++];
                try {
                    let session = this._sessionManager.getExistingSession(node);
                    if (!session && !expr.trim()) continue;
                    session ??= await this._sessionManager.getSession(node, ['/seedemu_sniffer'], true);
                    session.stream.write(`${expr}\r`);
                } catch (error) {
                    this._logger.error(`error communicating with node ${node}: ${error}`);
                    firstError ??= error;
                }
            }
        };
        await Promise.all(Array.from({length: Math.min(concurrency, nodes.length)}, () => worker()));
        if (firstError) throw firstError;
    }

    setListener(listener: (nodeId: string, stdout: any) => void) {
        this._listener = listener;
    }

    setCapturePacketListener(listener: (nodeId: string) => void) {
        this._capturePacketListener = listener;
    }

    clearListener() {
        this._listener = undefined;
    }

    getLoggers(): Logger[] {
        return [this._logger, this._sessionManager.getLoggers()[0]];
    }
}
