import { reqGetContainersList, reqGetNetworksList, URL } from '@/api/map';
import request from '@/utils/request';

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedRequest = vi.mocked(request);

describe('map api service', () => {
  beforeEach(() => {
    mockedRequest.get.mockReset();
  });

  it('requests containers with query params', async () => {
    const response = { ok: true, result: [{ Id: 'node-1' }] };
    mockedRequest.get.mockResolvedValue(response);

    await expect(reqGetContainersList({ page: 1 })).resolves.toEqual(response);

    expect(mockedRequest.get).toHaveBeenCalledWith(URL.CONTAINER_URL, {
      params: { page: 1 },
    });
  });

  it('requests networks with query params', async () => {
    const response = { ok: true, result: [{ Id: 'net-1' }] };
    mockedRequest.get.mockResolvedValue(response);

    await expect(reqGetNetworksList({ keyword: 'net' })).resolves.toEqual(response);

    expect(mockedRequest.get).toHaveBeenCalledWith(URL.NETWORK_URL, {
      params: { keyword: 'net' },
    });
  });
});
