import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'

import { applyThemeTo } from 'galavi'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// FUI theme (single source of truth in galavi): writes the --galavi-* custom
// properties on <html> so every Vue component and HUD block shares the palette.
applyThemeTo(document.documentElement)

app.mount('#app')
