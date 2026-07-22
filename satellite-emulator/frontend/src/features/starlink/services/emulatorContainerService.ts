import { emulatorRequest } from '@/utils/request';

type ApiResponse<Result> = {
  ok: boolean;
  result: Result;
};

export type EmulatorContainerInfo = {
  Id: string;
  Names?: string[];
  meta?: {
    emulatorInfo?: {
      name?: string;
      role?: string;
      displayname?: string;
      longitude?: string;
      latitude?: string;
    };
  };
};

function isEmulatorContainerInfo(value: unknown): value is EmulatorContainerInfo {
  const container = value as EmulatorContainerInfo;

  return Boolean(
    container &&
      typeof container.Id === 'string' &&
      (container.Names === undefined ||
        (Array.isArray(container.Names) && container.Names.every((name) => typeof name === 'string'))) &&
      (container.meta === undefined ||
        container.meta.emulatorInfo === undefined ||
        container.meta.emulatorInfo.name === undefined ||
        typeof container.meta.emulatorInfo.name === 'string'),
  );
}

export async function fetchEmulatorContainers(): Promise<EmulatorContainerInfo[]> {
  const response = await emulatorRequest.get('/container') as unknown as ApiResponse<unknown>;

  if (!response.ok || !Array.isArray(response.result)) {
    throw new Error('Failed to load emulator containers.');
  }

  return response.result.filter(isEmulatorContainerInfo);
  // return [];
}
