import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Baterías del asistente TEO (docs/asistente/08 y 09) contra el modelo REAL.
// Gastan API: no corren con `pnpm test`. Uso:
//   ASSISTANT_EVAL_CONFIRM=1 pnpm assistant:eval   (requiere ANTHROPIC_API_KEY)
// Sin la confirmación solo corre el test del parser. Resultados en
// .assistant-eval/ (gitignored). Alias iguales a vitest.config.mts.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/eval/**/*.eval.ts'],
    testTimeout: 30 * 60_000,
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
