import { describe, it, expect, vi, afterEach } from 'vitest'

const UNNAMED_URI = 'mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority'
const NAMED_URI = 'mongodb+srv://user:pass@cluster0.example.mongodb.net/takeasygo-staging?retryWrites=true&w=majority'

const ORIGINAL_URI = process.env.MONGODB_URI
const ORIGINAL_PHASE = process.env.NEXT_PHASE

async function importMongoose() {
  vi.resetModules()
  return import('@/lib/mongoose')
}

afterEach(() => {
  if (ORIGINAL_URI === undefined) delete process.env.MONGODB_URI
  else process.env.MONGODB_URI = ORIGINAL_URI
  if (ORIGINAL_PHASE === undefined) delete process.env.NEXT_PHASE
  else process.env.NEXT_PHASE = ORIGINAL_PHASE
  vi.resetModules()
})

// Timeout alto: importar mongoose en un worker saturado por la suite completa
// supera los 5s por defecto (módulo pesado + disco Dropbox).
const TIMEOUT = 30_000

describe('lib/mongoose: nunca lanza en import time (collect page data de Vercel)', () => {
  it('URI sin nombre de base: importar no lanza (prod = base default por diseño)', async () => {
    process.env.MONGODB_URI = UNNAMED_URI
    delete process.env.NEXT_PHASE
    const mod = await importMongoose()
    expect(typeof mod.connectDB).toBe('function')
  }, TIMEOUT)

  it('URI con nombre de base: importar funciona', async () => {
    process.env.MONGODB_URI = NAMED_URI
    delete process.env.NEXT_PHASE
    const mod = await importMongoose()
    expect(typeof mod.connectDB).toBe('function')
  }, TIMEOUT)

  it('sin MONGODB_URI: importar no lanza (el build no tiene por qué fallar)', async () => {
    delete process.env.MONGODB_URI
    delete process.env.NEXT_PHASE
    const mod = await importMongoose()
    expect(typeof mod.connectDB).toBe('function')
  }, TIMEOUT)

  it('en fase de build (NEXT_PHASE seteado) también importa ok', async () => {
    process.env.MONGODB_URI = UNNAMED_URI
    process.env.NEXT_PHASE = 'phase-production-build'
    const mod = await importMongoose()
    expect(typeof mod.connectDB).toBe('function')
  }, TIMEOUT)

  it('connectDB sin MONGODB_URI rechaza con error claro', async () => {
    delete process.env.MONGODB_URI
    delete process.env.NEXT_PHASE
    const mod = await importMongoose()
    await expect(mod.connectDB()).rejects.toThrow(/no está definido/)
  }, TIMEOUT)
})
