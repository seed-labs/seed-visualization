import { Controller } from '../../../src/utils/controller';

function createControllerWithRun(output: string) {
  const controller = Object.create(Controller.prototype) as any;
  controller._logger = { debug: jest.fn() };
  controller._run = jest.fn().mockResolvedValue({
    id: 1,
    return_value: 0,
    output,
  });
  return controller;
}

describe('Controller service', () => {
  it('parses fragmented and coalesced worker result frames without mixing JSON payloads', () => {
    const controller = Object.create(Controller.prototype) as any;
    const first = jest.fn();
    const second = jest.fn();
    controller._logger = { debug: jest.fn(), warn: jest.fn() };
    controller._messageBuffer = {};
    controller._unresolvedPromises = { 1: first, 2: second };

    controller._consumeMessageChunk('node-1', 'shell output\n_BEGIN_RES');
    controller._consumeMessageChunk(
      'node-1',
      'ULT_{"id":1,"return_value":0,"output":"one"}_END_RESULT__BEGIN_RESULT_{"id":2,"return_value":0,',
    );
    controller._consumeMessageChunk('node-1', '"output":"two"}_END_RESULT_ prompt');

    expect(first).toHaveBeenCalledWith({ id: 1, return_value: 0, output: 'one' });
    expect(second).toHaveBeenCalledWith({ id: 2, return_value: 0, output: 'two' });
    expect(controller._logger.warn).not.toHaveBeenCalled();
  });

  it('maps net_status output to a boolean', async () => {
    const controller = createControllerWithRun('eth0 is up');

    await expect(controller.isNetworkConnected('node-1')).resolves.toBe(true);

    expect(controller._run).toHaveBeenCalledWith('node-1', 'net_status');
  });

  it('parses BGP peer rows from bird output', async () => {
    const controller = createControllerWithRun('peer_a BGP master up 2024 established\n');

    await expect(controller.listBgpPeers('node-1')).resolves.toEqual([
      {
        name: 'peer_a',
        protocolState: 'up',
        bgpState: 'established',
      },
    ]);
  });
});
