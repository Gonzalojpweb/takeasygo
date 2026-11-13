/* eslint-disable security/detect-non-literal-fs-filename -- lee archivos del propio repo, rutas armadas acá */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// El mapa de /app carga su worker desde public/vendor/maplibre/<versión>/.
// Si se actualiza maplibre-gl sin copiar el worker nuevo, el mapa queda en
// blanco en producción: este test lo frena antes.
describe('worker de MapLibre', () => {
  it('existe para la versión instalada y es el mismo archivo', () => {
    const require = createRequire(import.meta.url)
    const pkgPath = require.resolve('maplibre-gl/package.json')
    const { version } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }

    const served = path.resolve(__dirname, '../../public/vendor/maplibre', version, 'maplibre-gl-worker.mjs')
    expect(existsSync(served), `Falta ${served} — ver public/vendor/maplibre/LEEME.md`).toBe(true)

    const original = path.join(path.dirname(pkgPath), 'dist/maplibre-gl-worker.mjs')
    expect(readFileSync(served).equals(readFileSync(original))).toBe(true)
  })
})
