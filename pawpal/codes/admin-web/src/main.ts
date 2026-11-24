import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { applyBrand } from './brand';
import { router } from './router';
import { initSentry } from './sentry';

applyBrand();
const app = createApp(App);
initSentry(app, import.meta.env.VITE_SENTRY_DSN as string | undefined); // R61-1: off unless set
app.use(ElementPlus).use(router).mount('#app');
