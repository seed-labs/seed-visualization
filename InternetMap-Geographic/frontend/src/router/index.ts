import {createRouter, createWebHistory, type RouteRecordRaw} from 'vue-router'
import {RouterToListItem} from "@/utils/tools.ts"
import type {NewRouteRecord, RouteRecord} from "@/types/index.ts"
import {getPlugins} from "@/utils/router.ts";


export const defaultRouters: RouteRecord[] = [
    {
        path: '/',
        component: () => import('@/view/layout/index.vue'),
        redirect: {name: "home"},
        name: 'layout',
        children: [
            {
                path: '/home',
                component: () => import('@/view/home/index.vue'),
                name: 'home',
                meta: {
                    title: "Home",
                    icon: 'HomeFilled',
                    componentName: 'Home',
                },
            },
        ]
    },
    {
        path: '/mapIndex',
        component: () => import('@/view/map/index.vue'),
        redirect: {name: "liveEmulatorTopology3D"},
        name: 'mapIndex',
        children: [
            {
                path: '/upload/3d',
                component: () => import('@/view/map/emulatorTopology3D/emulatorTopology3D.vue'),
                name: 'emulatorTopology3D',
                meta: {
                    title: "EmulatorTopology3D",
                    icon: 'HomeFilled',
                    componentName: 'EmulatorTopology3D',
                },
            },
            {
                path: '/upload/2d',
                component: () => import('@/view/map/emulatorTopology2D/emulatorTopology2D.vue'),
                name: 'emulatorTopology2D',
                meta: {
                    title: "EmulatorTopology2D",
                    icon: 'HomeFilled',
                    componentName: 'EmulatorTopology2D',
                },
            },
            {
                path: '/map/3d',
                component: () => import('@/view/map/liveEmulatorTopology3D/liveEmulatorTopology3D.vue'),
                name: 'liveEmulatorTopology3D',
                meta: {
                    title: "LiveEmulatorTopology3D",
                    icon: 'HomeFilled',
                    componentName: 'LiveEmulatorTopology3D',
                },
            },
            {
                path: '/map/2d',
                component: () => import('@/view/map/liveEmulatorTopology2D/liveEmulatorTopology2D.vue'),
                name: 'liveEmulatorTopology2D',
                meta: {
                    title: "LiveEmulatorTopology2D",
                    icon: 'HomeFilled',
                    componentName: 'LiveEmulatorTopology2D',
                },
            },
        ]
    },
    {
        path: '/console',
        component: () => import('@/view/console/index.vue'),
        name: 'console',
        meta: {
            title: "Console",
            icon: 'HomeFilled',
            componentName: 'Console',
        },
    },
    {
        path: '/:pathMatch(.*)*',
        component: () => import('@/view/404/index.vue'),
        name: '404',
        meta: {
            title: '404',
            componentName: 'NotFound',
        }
    },
]

export const routerList: NewRouteRecord[] = RouterToListItem(defaultRouters)

export const createAppRouter = async () => {

    const pluginRoutes = getPlugins().flatMap(
        plugin => plugin.routes || []
    )

    return createRouter({
        history: createWebHistory(
            import.meta.env.VITE_FRONTEND_URL_PREFIX
        ),

        routes: [
            ...defaultRouters,
            ...pluginRoutes,
        ] as RouteRecordRaw[],

        scrollBehavior() {
            return {
                left: 0,
                top: 0,
            }
        },
    })
}
