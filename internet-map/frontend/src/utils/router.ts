import type {RouteRecord} from "@/types/index.ts"

export interface AppPlugin {
    name: string

    routes?: RouteRecord[]

    install?: () => void
}

const plugins: AppPlugin[] = []

export function registerPlugin(plugin: AppPlugin) {
    plugins.push(plugin)
}

export function getPlugins() {
    return plugins
}