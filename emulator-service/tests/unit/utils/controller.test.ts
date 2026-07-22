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
