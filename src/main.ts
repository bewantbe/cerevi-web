import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import { initI18n } from '@/composables/useI18n'

const app = createApp(App)

initI18n(app)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)

app.mount('#app')
