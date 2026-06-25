import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'
import {loadEnv, type PluginOption} from 'vite'
import {defineConfig} from 'vitest/config'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'

const envDir = 'env'

function readNumberEnv(value: string | undefined, fallback: number) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, '')
}

function normalizeBase(base: string | undefined) {
    if (!base || base === '/') return ''
    return `/${trimTrailingSlash(base).replace(/^\/+/, '')}`
}

function createCesiumBuildBasePlugin(env: Record<string, string>): PluginOption {
    const base = normalizeBase(env.VITE_BUILD_ASSET_PREFIX)
    let isBuild = false

    return {
        name: 'cesium-build-base',
        enforce: 'post',
        config(_, {command}) {
            isBuild = command === 'build'
        },
        transformIndexHtml(html) {
            if (!isBuild || !base) {
                return html
            }

            return html.replaceAll('"/cesium/', `"${base}/cesium/`)
        },
    }
}

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, envDir)
    return {
        preflight: false,
        lintOnSave: false,
        envDir: envDir,
        plugins: [
            vue(),
            cesium({
                cesiumBaseUrl: '../cesium',
            }),
            createCesiumBuildBasePlugin(env),
            ...(mode === 'test' ? [] : [
                Components({
                    resolvers: [ElementPlusResolver()],
                }),
                AutoImport({
                    resolvers: [ElementPlusResolver()],
                    imports: ['vue', 'vue-router'],
                }),
            ]),
        ],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            }
        },
        css: {
            preprocessorOptions: {
                scss: {
                    silenceDeprecations: ['legacy-js-api'],
                    javascriptEnables: true,
                }
            }
        },
        server: {
            cors: true,
            strictPort: true,
            port: readNumberEnv(env.VITE_FRONTEND_PORT, 5173),
            open: env.VITE_FRONTEND_OPEN === 'true',
            host: env.VITE_FRONTEND_HOST,
            proxy: {
                [env.VITE_SERVER_URL_PREFIX]: {
                    target: env.VITE_PROXY_ADDRESS,
                    changeOrigin: true,
                    // rewrite: (path) => path.replace(new RegExp(env.VITE_APP_BASE_URL), ''),
                },
                [env.VITE_SERVER_EMULATOR_URL_PREFIX]: {
                    target: env.VITE_PROXY_EMULATOR_ADDRESS,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(new RegExp(env.VITE_SERVER_EMULATOR_URL_PREFIX), '/api/v1'),
                },
            },
        },
        build: {
            outDir: env.VITE_BUILD_OUTPUT_PATH || 'dist',
            assetsDir: 'assets',
            rollupOptions: {
                output: {
                    chunkFileNames: 'assets/js/[name]-[hash].js',
                    entryFileNames: 'assets/js/[name]-[hash].js',
                    assetFileNames: ({name}) => {
                        const fileName = name || 'asset'
                        const extType = fileName.split('.').pop()?.toLowerCase() || ''

                        if (extType.match(/png|jpe?g|svg|gif|tiff|bmp|ico/)) {
                            return 'assets/images/[name]-[hash][extname]'
                        }
                        if (extType === 'css') {
                            return 'assets/css/[name]-[hash][extname]'
                        }
                        return 'assets/[name]-[hash][extname]'
                    }
                }
            }
        },
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: './tests/setup.ts',
            css: true,
            exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
        },
        base: env.VITE_BUILD_ASSET_PREFIX,
    }
})
