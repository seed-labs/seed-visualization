/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FRONTEND_TITLE?: string;
  readonly VITE_FRONTEND_URL_PREFIX?: string;
  readonly VITE_FRONTEND_HOST?: string;
  readonly VITE_FRONTEND_PORT?: string;
  readonly VITE_FRONTEND_OPEN?: string;
  readonly VITE_SERVER_URL_PREFIX?: string;
  readonly VITE_SERVER_EMULATOR_URL_PREFIX?: string;
  readonly VITE_SERVER_TIMEOUT?: string;
  readonly VITE_PROXY_ADDRESS?: string;
  readonly VITE_PROXY_EMULATOR_ADDRESS?: string;
  readonly VITE_BUILD_ASSET_PREFIX?: string;
  readonly VITE_BUILD_OUTPUT_PATH?: string;
  readonly VITE_BUILD_ASSETS_DIR?: string;
  readonly VITE_BUILD_SOURCEMAP?: string;
  readonly VITE_BUILD_MINIFY?: string;
  readonly VITE_BUILD_CHUNK_SIZE_WARNING_LIMIT?: string;
  readonly VITE_CESIUM_BASE_URL?: string;
  readonly VITE_SATELLITE_TILES_URL?: string;
  readonly VITE_SATELLITE_TILES_PROXY_ADDRESS?: string;
  readonly VITE_TRAFFIC_OBSERVER_URL_PREFIX?: string;
  readonly VITE_TRAFFIC_OBSERVER_ADDRESS?: string;
  readonly VITE_TRAFFIC_OBSERVER_WS_URL?: string;
  readonly VITE_TRAFFIC_OBSERVER_FILTER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}
