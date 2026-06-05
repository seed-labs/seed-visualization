/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_APP_BASE_URL?: string;
  readonly VITE_BUILD_ASSET_PREFIX?: string;
  readonly VITE_DEV_SERVER_HOST?: string;
  readonly VITE_DEV_SERVER_PORT?: string;
  readonly VITE_PREVIEW_SERVER_HOST?: string;
  readonly VITE_PREVIEW_SERVER_PORT?: string;
  readonly VITE_BUILD_OUT_DIR?: string;
  readonly VITE_BUILD_ASSETS_DIR?: string;
  readonly VITE_BUILD_SOURCEMAP?: string;
  readonly VITE_BUILD_MINIFY?: string;
  readonly VITE_BUILD_CHUNK_SIZE_WARNING_LIMIT?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PREFIX?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_DEV_PROXY_ENABLED?: string;
  readonly VITE_DEV_PROXY_TARGET?: string;
  readonly VITE_DEV_PROXY_CHANGE_ORIGIN?: string;
  readonly VITE_DEV_PROXY_REWRITE_PREFIX?: string;
  readonly VITE_CESIUM_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}
