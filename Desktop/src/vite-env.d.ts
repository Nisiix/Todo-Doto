/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Lingua dell'interfaccia, decisa in fase di build: `it` (predefinita) o `en`. */
  readonly VITE_LOCALE?: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
