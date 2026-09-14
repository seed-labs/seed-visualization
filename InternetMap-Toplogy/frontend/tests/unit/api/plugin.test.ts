import { reqGetInstallList, reqInstall, reqUninstall, URL, type pluginType } from '@/api/plugin';
import request from '@/utils/request';

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedRequest = vi.mocked(request);
const jsonConfig = { headers: { 'Content-Type': 'application/json;charset=UTF-8' } };

describe('plugin api service', () => {
  beforeEach(() => {
    mockedRequest.get.mockReset();
    mockedRequest.post.mockReset();
  });

  it('requests installable plugins with query params', async () => {
    const response = { ok: true, result: [{ id: 'terminal', name: 'Terminal' }] };
    mockedRequest.get.mockResolvedValue(response);

    await expect(reqGetInstallList({ keyword: 'term' })).resolves.toEqual(response);

    expect(mockedRequest.get).toHaveBeenCalledWith(URL.INSTALL_URL, {
      params: { keyword: 'term' },
    });
  });

  it('posts plugin install requests as JSON', async () => {
    const plugin: pluginType = { id: 'map-3d', name: 'Map 3D', version: '1.0.0' };
    const response = { ok: true, result: plugin };
    mockedRequest.post.mockResolvedValue(response);

    await expect(reqInstall(plugin)).resolves.toEqual(response);

    expect(mockedRequest.post).toHaveBeenCalledWith(URL.INSTALL_URL, plugin, jsonConfig);
  });

  it('posts plugin uninstall requests as JSON', async () => {
    const plugin: pluginType = { id: 'map-3d', name: 'Map 3D' };
    const response = { ok: true, result: plugin };
    mockedRequest.post.mockResolvedValue(response);

    await expect(reqUninstall(plugin)).resolves.toEqual(response);

    expect(mockedRequest.post).toHaveBeenCalledWith(URL.UNINSTALL_URL, plugin, jsonConfig);
  });
});
