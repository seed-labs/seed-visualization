import {createApp} from 'vue'
import App from './App.vue'
import '@/style/reset.scss'
import 'element-plus/dist/index.css';
import {registerPlugin} from '@/utils/router'
import {createAppRouter} from "@/router/index.ts"

const pluginModules = import.meta.glob(
    [
        // '../private/**/routes.ts',
        './view/map/worldMap/routes.ts',
    ],
    {
        eager: true,
    }
)

Object.values(pluginModules).forEach((mod: any) => {
    const {satellitePlugin} = mod
    if (satellitePlugin) {
        registerPlugin(satellitePlugin)
    }
})

const router = await createAppRouter()
const app = createApp(App);
app.use(router);
app.mount('#app');
