import request from '@/utils/request';
import type { NetworkNodeLocation } from '@/features/starlink/types';

type ApiResponse<Result> = {
  ok: boolean;
  result: Result;
};

function isNetworkNodeLocation(value: unknown): value is NetworkNodeLocation {
  const node = value as NetworkNodeLocation;

  return Boolean(
    node &&
      typeof node.id === 'string' &&
      typeof node.type === 'string' &&
      typeof node.name === 'string' &&
      typeof node.longitude === 'number' &&
      typeof node.latitude === 'number' &&
      (node.altitudeMeters === undefined || typeof node.altitudeMeters === 'number') &&
      Math.abs(node.longitude) <= 180 &&
      Math.abs(node.latitude) <= 90,
  );
}

export async function fetchNetworkNodes(): Promise<NetworkNodeLocation[]> {
  // const response = await request.get('/satellite/network-nodes') as unknown as ApiResponse<unknown>;

  // if (!response.ok || !Array.isArray(response.result)) {
  //   throw new Error('Failed to load network nodes.');
  // }

  // return response.result.filter(isNetworkNodeLocation);
  return [];
}
