import type { Express } from 'express'
import request from 'supertest'
import { loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('admin_users')
})
afterAll(teardownDb)

describe('admin users', () => {
  it('does not list the logged-in admin, but lists other admins', async () => {
    const { agent, user: me } = await loginAs(app, 'admin')
    const { user: other } = await loginAs(app, 'admin')
    const res = await agent.get('/api/admin/users?role=admin&limit=50')
    const ids = res.body.data.users.map((u: { _id: string }) => u._id)
    expect(ids).not.toContain(me._id.toString())
    expect(ids).toContain(other._id.toString())
    expect(res.body.meta.total).toBe(ids.length)
  })

  it('lists users with search and role filter', async () => {
    const { agent } = await loginAs(app, 'admin')
    const { user: business } = await loginAs(app, 'business')

    const res = await agent.get(`/api/admin/users?role=business&q=${encodeURIComponent(business.email)}`)
    expect(res.status).toBe(200)
    expect(res.body.data.users).toHaveLength(1)
    expect(res.body.data.users[0].email).toBe(business.email)
    expect(res.body.data.users[0].password).toBeUndefined()
    expect(res.body.meta.total).toBe(1)
  })

  it('suspends and unsuspends a user, logs it and blocks their login', async () => {
    const { agent } = await loginAs(app, 'admin')
    const { user: target, agent: targetAgent } = await loginAs(app, 'talent')

    const suspend = await agent.patch(`/api/admin/users/${target._id}/status`).send({ status: 'suspended' })
    expect(suspend.status).toBe(200)
    expect(suspend.body.data.user.status).toBe('suspended')

    // Suspended user ka refresh token kaam nahi karta, login bhi nahi
    expect((await targetAgent.post('/api/auth/refresh')).status).toBe(401)
    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: 'password123' })
    expect(login.status).toBe(403)

    const unsuspend = await agent.patch(`/api/admin/users/${target._id}/status`).send({ status: 'active' })
    expect(unsuspend.body.data.user.status).toBe('active')

    const logs = await agent.get(`/api/admin/audit-logs?targetType=user&targetId=${target._id}`)
    expect(logs.body.data.logs.map((l: { action: string }) => l.action)).toEqual(['user.unsuspend', 'user.suspend'])
  })

  it('changes a role', async () => {
    const { agent } = await loginAs(app, 'admin')
    const { user: target } = await loginAs(app, 'business')
    const res = await agent.patch(`/api/admin/users/${target._id}/role`).send({ role: 'agency' })
    expect(res.status).toBe(200)
    expect(res.body.data.user.role).toBe('agency')
  })

  it('does not let an admin suspend or demote themselves', async () => {
    const { agent, user: me } = await loginAs(app, 'admin')
    const suspend = await agent.patch(`/api/admin/users/${me._id}/status`).send({ status: 'suspended' })
    expect(suspend.status).toBe(403)
    expect(suspend.body.error.code).toBe('CANNOT_MODIFY_SELF')
    const demote = await agent.patch(`/api/admin/users/${me._id}/role`).send({ role: 'business' })
    expect(demote.status).toBe(403)
  })

  it('keeps at least one active admin', async () => {
    const { User } = await import('../src/models/User')
    // Sirf ek doosra admin bacha ho, aur hum usko hatane ki koshish karein
    await User.updateMany({ role: 'admin' }, { $set: { status: 'suspended' } })
    const { agent, user: me } = await loginAs(app, 'admin')
    const other = await User.create({ name: 'Other', email: `other${Date.now()}@test.com`, password: 'password123', role: 'admin' })
    await User.updateOne({ _id: me._id }, { $set: { status: 'suspended' } })
    // "me" ka access token abhi valid hai; ab sirf "other" active admin hai
    const res = await agent.patch(`/api/admin/users/${other._id}/role`).send({ role: 'talent' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LAST_ADMIN')
    await User.updateMany({ role: 'admin' }, { $set: { status: 'active' } })
  })

  it('blocks non-admins', async () => {
    const { agent } = await loginAs(app, 'business')
    const { user: target } = await loginAs(app, 'talent')
    expect((await agent.get('/api/admin/users')).status).toBe(403)
    expect((await agent.patch(`/api/admin/users/${target._id}/status`).send({ status: 'suspended' })).status).toBe(403)
    expect((await agent.patch(`/api/admin/users/${target._id}/role`).send({ role: 'admin' })).status).toBe(403)
  })

  it('validates input', async () => {
    const { agent } = await loginAs(app, 'admin')
    const { user: target } = await loginAs(app, 'talent')
    const res = await agent.patch(`/api/admin/users/${target._id}/role`).send({ role: 'king' })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.role).toBeDefined()
  })
})
