import { vi, beforeAll, afterAll, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.MONGOMS_VERSION = '8.0.4'
  process.env.MONGOMS_DOWNLOAD_DIR = 'C:/Users/Gonzalo Palomo/.cache/mongodb-memory-server'
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
