import mongoose from 'mongoose'
import { env } from './env'
import { migrateLegacyClaims } from '../models/ProfileClaim'
import { unverifyUnclaimedPeople } from '../services/personModerationService'

// Vercel pe har request naya function chala sakti hai, is liye connection
// ko cache karte hain taake har dafa naya connection na bane
let connectionPromise: Promise<typeof mongoose> | null = null

export async function connectDB() {
  // Connect + migration chal raha ho to usi ka intezar karo
  // (disconnect ke baad readyState 0 hota hai, tab naya connection banao)
  if (connectionPromise && mongoose.connection.readyState !== 0) return connectionPromise
  if (mongoose.connection.readyState === 1) return mongoose

  if (!env.mongoUri) {
    throw new Error('MONGO_URI is not set in the environment')
  }

  connectionPromise = mongoose
    .connect(env.mongoUri)
    // Har naye connection pe purane claims naye status mein (pehli request se pehle)
    .then(async (connection) => {
      await migrateLegacyClaims()
      await unverifyUnclaimedPeople()
      return connection
    })
    .catch((error) => {
      connectionPromise = null
      throw error
    })

  return connectionPromise
}
