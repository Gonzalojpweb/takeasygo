import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Arranque de MongoMemoryServer en beforeAll: en Windows puede superar
    // los 10 s por defecto (ver __tests__/integration/setup.ts).
    hookTimeout: 120_000,
    // Los tests de integración encadenan varias llamadas a handlers reales con
    // MongoMemoryServer. Con la suite completa en paralelo (Windows, 4 núcleos)
    // varios pasan los 5 s por defecto sin estar colgados: commissions-weekly,
    // pos-cash-control, inventory-v3 (31/10/2026). Un límite por test persigue
    // síntomas; este es global y sigue cortando un test realmente colgado.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': __dirname,
      '@takeasygo/types': path.resolve(__dirname, '../../packages/types/src'),
      '@takeasygo/db': path.resolve(__dirname, '../../packages/db/src'),
      '@takeasygo/business': path.resolve(__dirname, '../../packages/business/src'),
    },
  },
})
