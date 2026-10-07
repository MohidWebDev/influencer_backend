import type { Express } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import type { Role } from '../src/constants/roles'

// Har test file apna alag database use karti hai
export async function setupApp(dbName: string) {
  const base = process.env.TEST_MONGO_BASE!.replace(/\/?(\?.*)?$/, '')
  process.env.MONGO_URI = `${base}/${dbName}`
  const { default: app } = await import('../src/app')
  const { connectDB } = await import('../src/config/db')
  await connectDB()
  return app as Express
}

export async function teardownDb() {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
}

let counter = 0

// User banao aur login karke cookies wala agent wapas do
export async function loginAs(app: Express, role: Role, extra: { status?: 'active' | 'suspended' } = {}) {
  const { User } = await import('../src/models/User')
  counter += 1
  const email = `${role}${counter}-${Date.now()}@test.com`
  const user = await User.create({ name: `${role} ${counter}`, email, password: 'password123', role, ...extra })
  const agent = request.agent(app)
  if (extra.status !== 'suspended') {
    const res = await agent.post('/api/auth/login').send({ email, password: 'password123' })
    if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`)
  }
  return { agent, user }
}

export async function createPerson(overrides: Record<string, unknown> = {}) {
  const { Person } = await import('../src/models/Person')
  counter += 1
  return Person.create({ name: `Test Person ${counter}`, slug: `test-person-${counter}-${Date.now()}`, ...overrides })
}
