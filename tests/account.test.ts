import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('account_settings')
})
afterAll(teardownDb)

describe('change password', () => {
  it('needs the current password and logs out other devices', async () => {
    const { agent, user } = await loginAs(app, 'talent')
    // Doosri device
    const other = request.agent(app)
    await other.post('/api/auth/login').send({ email: user.email, password: 'password123' })

    const wrong = await agent.patch('/api/auth/password').send({ currentPassword: 'nope', newPassword: 'newpassword1' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.fields.currentPassword).toBeTruthy()

    const same = await agent.patch('/api/auth/password').send({ currentPassword: 'password123', newPassword: 'password123' })
    expect(same.status).toBe(400)

    const ok = await agent.patch('/api/auth/password').send({ currentPassword: 'password123', newPassword: 'newpassword1' })
    expect(ok.status).toBe(200)
    // Is device pe abhi bhi login
    expect((await agent.get('/api/auth/me')).status).toBe(200)
    // Doosri device ka refresh token bekaar
    expect((await other.post('/api/auth/refresh')).status).toBe(401)
    // Naya password chalta hai, purana nahi
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' })).status).toBe(401)
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'newpassword1' })).status).toBe(200)
  })
})

describe('delete account', () => {
  it('needs the exact confirmation text and frees the owned profile', async () => {
    const { agent, user } = await loginAs(app, 'talent')
    const person = await createPerson({ claimedBy: user._id, verified: true })

    const bad = await agent.delete('/api/auth/account').send({ confirm: 'delete someone' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('CONFIRMATION_MISMATCH')

    const ok = await agent.delete('/api/auth/account').send({ confirm: `  DELETE   ${user.name} ` })
    expect(ok.status).toBe(200)

    const { User } = await import('../src/models/User')
    const { Person } = await import('../src/models/Person')
    expect(await User.findById(user._id)).toBeNull()
    const freed = await Person.findById(person._id)
    expect(freed?.claimedBy).toBeNull()
    expect(freed?.verified).toBe(false)
    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })

  it('does not let the last active admin delete their account', async () => {
    const { User } = await import('../src/models/User')
    await User.updateMany({ role: 'admin' }, { $set: { status: 'suspended' } })
    const { agent, user } = await loginAs(app, 'admin')
    const res = await agent.delete('/api/auth/account').send({ confirm: `delete ${user.name}` })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LAST_ADMIN')
  })

  it('needs login', async () => {
    expect((await request(app).delete('/api/auth/account').send({ confirm: 'x' })).status).toBe(401)
    expect((await request(app).patch('/api/auth/password').send({})).status).toBe(401)
  })
})
