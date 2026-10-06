import mongoose from 'mongoose'
import { env } from './env'

// Vercel pe har request naya function chala sakti hai, is liye connection
// ko cache karte hain taake har dafa naya connection na bane
let connectionPromise: Promise<typeof mongoose> | null = null

export async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose

  if (!env.mongoUri) {
    throw new Error('MONGO_URI is not set in the environment')
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(env.mongoUri).catch((error) => {
      connectionPromise = null
      throw error
    })
  }

  return connectionPromise
}
