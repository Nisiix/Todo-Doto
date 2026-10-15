import { defineConfig } from '@playwright/test'

/**
 * Test end-to-end sull'interfaccia (build Vite servita da `vite preview`).
 * Fuori da Tauri il filesystem è simulato in memoria, quindi i test coprono
 * tutto il flusso utente senza toccare il disco. Lancio: `npm run test:e2e`
 * (la prima volta: `npx playwright install chromium`).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1380, height: 860 },
    locale: 'it-IT',
    trace: 'retain-on-failure',
    // Per usare un Chromium già installato: PW_CHROMIUM_PATH=/percorso/chrome
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
