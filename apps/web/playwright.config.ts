import { defineConfig, devices } from '@playwright/test';

/**
 * E2E: requer API (porta 3333, com PostgreSQL) e web (5173) rodando — `npm run dev` na raiz.
 * Defina E2E_SCREENSHOTS=<pasta> para salvar capturas das telas.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'dark' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
