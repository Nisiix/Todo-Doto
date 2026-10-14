import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'
import 'dayjs/locale/it'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { locale, localeTag } from './i18n'

// La lingua è fissata in fase di build (VITE_LOCALE): dayjs e <html lang> la seguono.
dayjs.locale(locale)
dayjs.extend(relativeTime)
document.documentElement.lang = localeTag

// Disabilita il menu contestuale nativo della WebView fuori dai campi di testo
document.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null
  if (!t?.closest('input, textarea, [contenteditable]')) e.preventDefault()
})

createApp(App).use(createPinia()).use(router).mount('#app')
