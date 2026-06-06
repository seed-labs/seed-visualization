import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { appConfig } from '@/config/env';

export const routeNames = {
  starlink: 'starlink',
  notFound: 'not-found',
} as const;

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: { name: routeNames.starlink },
  },
  {
    path: '/starlink',
    name: routeNames.starlink,
    component: () => import('@/pages/StarlinkPage.vue'),
    meta: {
      title: appConfig.title,
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: routeNames.notFound,
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: {
      title: 'Page Not Found',
    },
  },
];

export const router = createRouter({
  history: createWebHistory(appConfig.baseUrl),
  routes,
});

router.afterEach((to) => {
  document.title = typeof to.meta.title === 'string' ? to.meta.title : appConfig.title;
});
