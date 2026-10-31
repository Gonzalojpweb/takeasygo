import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Auditoría 30/10/2026 (M3): el Sync ya no acepta pedidos internos sin
    // secreto configurado; los tests corren con uno, como producción.
    env: { INTERNAL_API_SECRET: 'test-internal-secret-0123456789' },
  },
  resolve: {
    alias: {
      '@takeasygo/db': path.resolve(__dirname, '../../packages/db/src'),
      '@takeasygo/types': path.resolve(__dirname, '../../packages/types/src'),
      '@takeasygo/business': path.resolve(__dirname, '../../packages/business/src'),
    },
  },
})
