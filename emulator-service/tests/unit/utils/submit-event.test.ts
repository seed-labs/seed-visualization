import { SubmitEvent } from '../../../src/utils/submit-event';

describe('SubmitEvent runtime interactions', () => {
  it('executes a command inside a node through the runtime client', async () => {
    const runtime = {
      exec: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    };
    const service = new SubmitEvent(runtime as any);

    await service.execCmdInContainer('node-1', ['rm', '-f', '/tmp/plugin.sh']);

    expect(runtime.exec).toHaveBeenCalledWith('node-1', ['rm', '-f', '/tmp/plugin.sh']);
  });

  it('raises runtime execution failures to callers', async () => {
    const runtime = {
      exec: jest.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' }),
    };
    const service = new SubmitEvent(runtime as any);

    await expect(service.execCmdInContainer('node-1', ['false'])).rejects.toThrow(
      'Failed to exec cmd'
    );
  });
});
