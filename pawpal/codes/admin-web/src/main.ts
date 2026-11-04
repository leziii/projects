import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { applyBrand } from './brand';
import { router } from './router';

applyBrand();
createApp(App).use(ElementPlus).use(router).mount('#app');
