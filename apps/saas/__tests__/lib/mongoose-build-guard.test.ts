import { describe, it, expect, vi, afterEach } from 'vitest'

const BAD_URI = 'mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority'
const GOOD_URI = 'mongodb+srv://user:pass@cluster0.example.mongodb.net/takeasygo-staging?retryWrites=true&w=majority'

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

describe('lib/mongoose guard de nombre de base', () => {
  it('build phase (collect page data): importa sin explotar aunque el URI no tenga nombre', async () => {
    process.env.MONGODB_URI = BAD_URI
    process.env.NEXT_PHASE = 'phase-production-build'
    const mod = await importMongoose()
    expect(typeof mod.connectDB).toBe('function')
  })

  it('runtime: importar con URI sin nombre de base lanza el guard', async () => {
    process.env.MONGODB_URI = BAD_URI
    delete process.env.NEXT_PHASE
    await expect(importMongoose()).rejects.toThrow(/no incluye un nombre de base/)
  })

  it('runtime: importar con nombre de base explícito funciona', async () => {
    process.env.MONGODB_URI = GOOD_URI
    delete process.env.NEXT_PHASE
    const mod = await importMongoose()
    expect(typeof mod.connectDB).toBe('function')
  })

  it('runtime: sin MONGODB_URI lanza el guard', async () => {
    delete process.env.MONGODB_URI
    delete process.env.NEXT_PHASE
    await expect(importMongoose()).rejects.toThrow(/no está definido/)
  })
})
