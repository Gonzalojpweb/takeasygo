import mongoose from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI

let isConnected = false

export async function connectMongo(): Promise<void> {
  if (isConnected) return
  if (!MONGODB_URI)
    throw new Error("MONGODB_URI environment variable is not set")
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  isConnected = true
}

export async function disconnectMongo(): Promise<void> {
  if (!isConnected) return
  await mongoose.disconnect()
  isConnected = false
}
