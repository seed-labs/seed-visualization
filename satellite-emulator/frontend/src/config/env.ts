function readNumberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`;
}

function joinUrl(baseUrl: string, prefix: string) {
  if (!baseUrl) {
    return prefix;
  }

  return `${trimTrailingSlash(baseUrl)}${ensureLeadingSlash(prefix)}`;
}

const apiBaseUrl = '';
const apiPrefix = import.meta.env.VITE_SERVER_URL_PREFIX ?? '/api/v1';
const emulatorApiPrefix = import.meta.env.VITE_SERVER_EMULATOR_URL_PREFIX ?? '/emulator/api/v1';

export const appConfig = {
  title: import.meta.env.VITE_FRONTEND_TITLE ?? 'Starlink Satellite 3D Globe Simulation',
  baseUrl: import.meta.env.VITE_FRONTEND_URL_PREFIX ?? import.meta.env.BASE_URL,
  api: {
    baseUrl: apiBaseUrl,
    prefix: apiPrefix,
    basePath: joinUrl(apiBaseUrl, apiPrefix),
    timeout: readNumberEnv(import.meta.env.VITE_SERVER_TIMEOUT, 30000),
  },
  emulatorApi: {
    baseUrl: apiBaseUrl,
    prefix: emulatorApiPrefix,
    basePath: joinUrl(apiBaseUrl, emulatorApiPrefix),
    timeout: readNumberEnv(import.meta.env.VITE_SERVER_TIMEOUT, 30000),
  },
} as const;
