import mongoose from 'mongoose'
import { assertMongoDbName } from '@takeasygo/business'

const MONGODB_URI = process.env.MONGODB_URI as string

// `next build` importa los route handlers para "collect page data": en ese
// fase no hay proceso runtime ni base real, así que el guard solo aplica a
// procesos que van a tocar la base (el check se repite en connectDB).
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build'

if (!IS_BUILD_PHASE) {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI no está definido en las variables de entorno')
  }
  assertMongoDbName(MONGODB_URI)
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var mongoose: MongooseCache
}

const cached: MongooseCache = global.mongoose || { conn: null, promise: null }

if (!global.mongoose) {
  global.mongoose = cached
}

export async function connectDB() {
  if (cached.conn) return cached.conn

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI no está definido en las variables de entorno')
  }
  // Guard en runtime: nunca conectar a una base sin nombre (prod = default).
  assertMongoDbName(MONGODB_URI)

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 5,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
    }).catch(err => {
      cached.promise = null
      throw err
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}