import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@takeasygo/db': path.resolve(__dirname, '../../packages/db/src'),
      '@takeasygo/types': path.resolve(__dirname, '../../packages/types/src'),
      '@takeasygo/business': path.resolve(__dirname, '../../packages/business/src'),
    },
  },
})
