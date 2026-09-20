import { vi, beforeAll, afterAll, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.MONGOMS_VERSION = '8.0.4'
  process.env.MONGOMS_DOWNLOAD_DIR = 'C:/Users/Gonzalo Palomo/.cache/mongodb-memory-server'
  process.env.MEMBER_TOKEN_SECRET = 'test-secret-for-integration'
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
})

const { MongoMemoryServer } = await import('mongodb-memory-server')
const mongoose = (await import('mongoose')).default

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
})

afterEach(async () => {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
})

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 0 }),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'admin-id', role: 'superadmin', tenantSlug: 'test-tenant' },
  }),
}))

vi.mock('@/lib/consumer', () => ({
  upsertConsumerFromLoyaltyMember: vi.fn().mockResolvedValue(undefined),
}))
