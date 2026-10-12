import mongoose from 'mongoose'
import { resolveMongoDbName } from '@takeasygo/business'

const MONGODB_URI = process.env.MONGODB_URI as string

// NOTA: este módulo NO valida en import time. `next build` importa páginas y
// rutas para "collect page data" (y ejecuta generateStaticParams), y el env
// de build no es un proceso runtime — cualquier throw en top-level mata el
// build de Vercel. Además producción corre por diseño sobre la base default
// del cluster (URI sin nombre), así que exigir nombre de base en la app
// rompería la app en producción: la validación estricta vive solo en los
// scripts de audit (allowlist staging).
if (MONGODB_URI && !resolveMongoDbName(MONGODB_URI)) {
  console.warn(
    '[mongoose] MONGODB_URI no incluye nombre de base (se usará la base default del cluster)'
  )
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