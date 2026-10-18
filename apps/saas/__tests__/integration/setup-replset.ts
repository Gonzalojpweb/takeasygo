/**
 * Setup de integración con REPLSET (no standalone): el POST de
 * /store/redemptions usa transacciones de MongoDB, que solo corren sobre un
 * replica set. Mismo entorno/mocks base que setup.ts, sin mockear rateLimit
 * (el flujo usa ≤2 intentos por test, bajo el límite real de 5/60s).
 */
import { vi, beforeAll, afterAll, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.MONGOMS_VERSION = '8.0.4'
  process.env.MONGOMS_DOWNLOAD_DIR = 'C:/Users/Gonzalo Palomo/.cache/mongodb-memory-server'
  process.env.MEMBER_TOKEN_SECRET = 'test-secret-for-integration'
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
})

const { MongoMemoryReplSet } = await import('mongodb-memory-server')
const mongoose = (await import('mongoose')).default

let replSet: import('mongodb-memory-server').MongoMemoryReplSet

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(replSet.getUri())
}, 60_000)

afterAll(async () => {
  await mongoose.disconnect()
  if (replSet) await replSet.stop()
})

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map(col => col.deleteMany({}))
  )
})

vi.mock('@/lib/consumer', () => ({
  upsertConsumerFromOrder: vi.fn().mockResolvedValue(undefined),
  upsertConsumerFromLoyaltyMember: vi.fn().mockResolvedValue(undefined),
}))
