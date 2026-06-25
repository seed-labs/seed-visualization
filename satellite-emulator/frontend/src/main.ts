import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/global.css';

createApp(App).use(ElementPlus).use(router).mount('#app');
