import { MongoMemoryServer } from 'mongodb-memory-server'

// Saare tests se pehle ek aarzi MongoDB chalao
export default async function globalSetup() {
  const mongo = await MongoMemoryServer.create()
  ;(globalThis as { __MONGO__?: MongoMemoryServer }).__MONGO__ = mongo
  process.env.TEST_MONGO_BASE = mongo.getUri()
}
