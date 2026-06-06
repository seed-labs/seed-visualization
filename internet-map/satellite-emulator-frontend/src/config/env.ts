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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
const apiPrefix = import.meta.env.VITE_API_PREFIX ?? '/api';

export const appConfig = {
  title: import.meta.env.VITE_APP_TITLE ?? 'Starlink Satellite 3D Globe Simulation',
  baseUrl: import.meta.env.VITE_APP_BASE_URL ?? import.meta.env.BASE_URL,
  api: {
    baseUrl: apiBaseUrl,
    prefix: apiPrefix,
    basePath: joinUrl(apiBaseUrl, apiPrefix),
    timeout: readNumberEnv(import.meta.env.VITE_API_TIMEOUT, 10000),
  },
} as const;
