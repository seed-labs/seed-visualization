import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, URL} from 'node:url';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';
import {defineConfig, loadEnv, type PluginOption} from 'vite';

const envDir = fileURLToPath(new URL('./env', import.meta.url));

function readNumberEnv(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(value: string | undefined, fallback: boolean) {
    if (value === undefined) {
        return fallback;
    }

    return value === 'true';
}

function readMinifyEnv(value: string | undefined) {
    if (value === 'false') {
        return false;
    }

    if (value === 'terser') {
        return 'terser';
    }

    return 'esbuild';
}

function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, '');
}

function normalizeBase(value: string | undefined) {
    if (!value || value === '/') {
        return '';
    }

    return `/${trimTrailingSlash(value).replace(/^\/+/, '')}`;
}

function createDevProxy(env: Record<string, string>) {
    if (!readBooleanEnv(env.VITE_DEV_PROXY_ENABLED, false)) {
        return undefined;
    }

    const prefix = env.VITE_API_PREFIX || '/api';
    const target = env.VITE_DEV_PROXY_TARGET || env.VITE_API_BASE_URL;
    if (!target) {
        return undefined;
    }

    const rewritePrefix = readBooleanEnv(env.VITE_DEV_PROXY_REWRITE_PREFIX, false);

    return {
        [prefix]: {
            target,
            changeOrigin: readBooleanEnv(env.VITE_DEV_PROXY_CHANGE_ORIGIN, true),
            rewrite: rewritePrefix ? (path: string) => path.replace(new RegExp(`^${prefix}`), '') : undefined,
        },
        '/satellite-tiles': {
            target: env.VITE_SATELLITE_TILES_PROXY_ADDRESS,
            changeOrigin: true,
        },
    };
}

function createPreviewAppBasePlugin(env: Record<string, string>): PluginOption {
    const outDir = path.resolve(env.VITE_BUILD_OUT_DIR || 'dist');
    const appBase = normalizeBase(env.VITE_APP_BASE_URL);
    const entryPath = appBase ? `${appBase}/starlink` : '/starlink';

    return {
        name: 'preview-app-base-history-fallback',
        configurePreviewServer(server) {
            server.middlewares.use((request, response, next) => {
                if (!appBase || !['GET', 'HEAD'].includes(request.method ?? 'GET')) {
                    next();
                    return;
                }

                const pathname = decodeURIComponent((request.url ?? '').split('?')[0] ?? '');
                if (pathname === '/' || pathname === appBase || pathname === `${appBase}/`) {
                    response.statusCode = 302;
                    response.setHeader('Location', entryPath);
                    response.end();
                    return;
                }

                next();
            });

            return () => {
                server.middlewares.use((request, response, next) => {
                    if (!appBase || !['GET', 'HEAD'].includes(request.method ?? 'GET')) {
                        next();
                        return;
                    }

                    const pathname = decodeURIComponent((request.url ?? '').split('?')[0] ?? '');
                    if (!pathname.startsWith(`${appBase}/`)) {
                        next();
                        return;
                    }

                    const indexPath = path.resolve(outDir, 'index.html');
                    response.setHeader('Content-Type', 'text/html; charset=utf-8');
                    createReadStream(indexPath).pipe(response);
                });
            };
        },
    };
}

export default defineConfig(({mode, command, isPreview}) => {
    const env = loadEnv(mode, envDir, '');

    return {
        envDir,
        base: command === 'build' && !isPreview ? env.VITE_BUILD_ASSET_PREFIX || '/' : '/',
        plugins: [
            vue(),
            cesium({
                cesiumBaseUrl: env.VITE_CESIUM_BASE_URL || '../cesium',
            }),
            createPreviewAppBasePlugin(env),
        ],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        server: {
            host: env.VITE_DEV_SERVER_HOST || '127.0.0.1',
            port: readNumberEnv(env.VITE_DEV_SERVER_PORT, 5173),
            proxy: createDevProxy(env),
        },
        preview: {
            host: env.VITE_PREVIEW_SERVER_HOST || '127.0.0.1',
            port: readNumberEnv(env.VITE_PREVIEW_SERVER_PORT, 4173),
        },
        build: {
            outDir: env.VITE_BUILD_OUT_DIR || 'dist',
            assetsDir: env.VITE_BUILD_ASSETS_DIR || 'assets',
            emptyOutDir: true,
            sourcemap: readBooleanEnv(env.VITE_BUILD_SOURCEMAP, false),
            minify: readMinifyEnv(env.VITE_BUILD_MINIFY),
            chunkSizeWarningLimit: readNumberEnv(env.VITE_BUILD_CHUNK_SIZE_WARNING_LIMIT, 1800),
            rollupOptions: {
                output: {
                    manualChunks: {
                        vue: ['vue', 'vue-router'],
                        elementPlus: ['element-plus', '@element-plus/icons-vue'],
                        satellite: ['satellite.js'],
                    },
                },
            },
        },
    };
});
