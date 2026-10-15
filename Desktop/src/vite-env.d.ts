/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** Iniettate da vite.config.ts (`define`). */
declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string
