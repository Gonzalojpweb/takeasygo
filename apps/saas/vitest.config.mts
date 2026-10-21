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
