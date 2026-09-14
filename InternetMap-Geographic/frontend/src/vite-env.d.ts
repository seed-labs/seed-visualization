/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRAFFIC_OBSERVER_URL_PREFIX?: string
  readonly VITE_TRAFFIC_OBSERVER_ADDRESS?: string
  readonly VITE_TRAFFIC_OBSERVER_WS_URL?: string
  readonly VITE_TRAFFIC_OBSERVER_FILTER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
