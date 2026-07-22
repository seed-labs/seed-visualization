import {LogProducer} from '../interfaces/log-producer';
import {Logger} from 'tslog';
import * as os from 'os';
import * as path from 'path';
import fs from 'fs';
import tar from 'tar-fs';
import {RuntimeClient} from '../runtime/types';

const PLUGINS_BASE_DIR = '/map-plugins';
export class SubmitEvent implements LogProducer {
    private _logger: Logger;
    private _runtime: RuntimeClient;

    constructor(runtime: RuntimeClient) {
        this._logger = new Logger({name: 'SubmitEvent'});
        this._runtime = runtime;
    }

    /**
     * Copy files from the current container to the target container
     * @param sourcePath
     * @param targetContainerId
     * @param targetPath
     */
    async copyToContainerFromCurrentContainer(
        sourcePath: string,
        targetContainerId: string,
        targetPath: string
    ): Promise<void> {
        try {
            if (!fs.existsSync(sourcePath)) {
                this._logger.error(`source path ${sourcePath} does not exist`);
                return
            }
            try {
                const result = await this._runtime.exec(targetContainerId, ['mkdir', '-p', targetPath]);
                if (result.exitCode !== 0) {
                    throw new Error(`Failed to create directory: ${targetPath}`);
                }

            } catch (error) {
                this._logger.error(`Failed to create target directory ${targetPath}:`, error);
                throw error;
            }

            const uploadStream = tar.pack(sourcePath);
            await this._runtime.copyToNode(uploadStream, targetContainerId, targetPath);
        } catch (error) {
            this._logger.error('copy failed:', error);
            throw error
        }
    }

    /**
     * Delete the specified file in the container
     * @param containerId
     * @param filePaths The file path to be deleted within the container
     */
    async delFileInContainer(containerId: string, filePaths: string[]): Promise<void> {
        this.execCmdInContainer(containerId, ['rm', '-f', ...filePaths]).then()
    }

    async execCmdInContainer(containerId: string, cmd: string[]): Promise<void> {
        try {
            const result = await this._runtime.exec(containerId, cmd);
            if (result.stdout) process.stdout.write(result.stdout);
            if (result.stderr) process.stderr.write(result.stderr);
            if (result.exitCode !== 0) {
                throw new Error(`Failed to exec cmd: (${cmd}), exit code: ${result.exitCode}`);
            }

            this._logger.info(`containerId: ${containerId} Successfully exec cmd: (${cmd})`);
        } catch (error) {
            this._logger.error(`Error exec cmd: (${cmd}), error: ${error}`);
            throw error;
        }
    }

    async submitEvent(address: string, nodes: string[], type: 'install' | 'uninstall', plugin: string): Promise<any> {
        let ret = false;
        switch (type) {
            case 'install':
                ret = await this._install(address, nodes, plugin);
                break
            case 'uninstall':
                ret = await this._uninstall(nodes, plugin);
                break
            default:
                this._logger.debug(`submit event type error: ${type}`);
                break
        }

        return ret;
    }

    async _install(address: string, nodes: string[], plugin: string) {
        let ret = false;
        switch (plugin) {
            case 'submit_event':
                ret = await this._installSubmitEvent(address, nodes)
                break
            default:
                break
        }
        return ret
    }

    async _installSubmitEvent(address: string, nodes: string[]) {
        let ret = true;

        this._logger.debug(`submit event install ...`);
        // create a temporary folder
        const tempDir = path.join(os.tmpdir(), 'submit-event');
        await fs.promises.mkdir(tempDir, {recursive: true});
        // read the file
        const sourceFilePath = '../plugin/submit_event/submit_event.sh'
        if (!fs.existsSync(sourceFilePath)) {
            this._logger.info(`File ${fs.realpathSync(sourceFilePath)} does not exist`);
            return
        }
        const fileContent = fs.readFileSync(sourceFilePath, 'utf8');
        // modify the address (ip+port)
        let modifiedContent = fileContent.replace('ADDRESS', address);

        try {
            await Promise.all(nodes.map(
                async node => {
                    const tempNodeDir = path.join(tempDir, node);
                    await fs.promises.mkdir(tempNodeDir, {recursive: true});
                    const tempFilePath = path.join(tempNodeDir, 'submit_event.sh');
                    fs.writeFileSync(tempFilePath, modifiedContent);
                    await this.copyToContainerFromCurrentContainer(tempNodeDir, node, PLUGINS_BASE_DIR);
                }
            ));
        } catch (error) {
            this._logger.error('submit event install failed: ', error);
            ret = false
        } finally {
            await fs.promises.rm(tempDir, {recursive: true, force: true});
        }
        return ret;
    }

    async _uninstall(nodes: string[], plugin: string) {
        let ret = true;
        let paths: string[] = [];
        switch (plugin) {
            case 'submit_event':
                paths = [`${PLUGINS_BASE_DIR}/submit_event.sh`]
                break
            default:
                break
        }
        if (paths.length === 0) {
            return ret
        }
        try {
            this._logger.debug(`${plugin} uninstall ...`);
            await Promise.all(nodes.map(
                async node => {
                    await this.delFileInContainer(node, paths);
                }
            ));
        } catch (error) {
            this._logger.error(`${plugin} uninstall failed: ${error}`);
            ret = false
        }

        return ret
    }

    getLoggers(): Logger[] {
        return [this._logger];
    }
}
