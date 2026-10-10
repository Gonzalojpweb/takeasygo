import { describe, it, expect, vi, afterEach } from 'vitest'

const validUri = 'mongodb+srv://user:pass@takeasygo.ssjlhfw.mongodb.net/takeasygo-staging?retryWrites=true'

async function loadConfigWith(uri: string | undefined) {
  vi.resetModules()
  if (uri === undefined) {
    delete process.env.MONGODB_URI
  } else {
    process.env.MONGODB_URI = uri
  }
  return import('../src/config')
}

afterEach(() => {
  delete process.env.MONGODB_URI
})

describe('config.mongoUri', () => {
  it('arranca con un URI que declara nombre de base', async () => {
    const { config } = await loadConfigWith(validUri)
    expect(config.mongoUri).toBe(validUri)
  })

  it('falla de forma explícita si el URI no declara nombre de base', async () => {
    await expect(loadConfigWith('mongodb+srv://user:pass@takeasygo.ssjlhfw.mongodb.net/?retryWrites=true')).rejects.toThrow(
      /no incluye un nombre de base/
    )
  })

  it('mantiene el comportamiento previo con URI vacía (manejo en index.ts)', async () => {
    const { config } = await loadConfigWith('')
    expect(config.mongoUri).toBe('')
  })
})
