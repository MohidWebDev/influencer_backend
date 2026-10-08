import type { Express } from 'express'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('admin_audit_stats')
})
afterAll(teardownDb)

describe('audit log', () => {
  it('records admin profile edits with before/after, but not owner edits', async () => {
    const { agent: admin, user: adminUser } = await loginAs(app, 'admin')
    const person = await createPerson({ city: 'Karachi' })

    const res = await admin.patch(`/api/people/${person._id}`).send({ city: 'Lahore' })
    expect(res.status).toBe(200)

    const logs = await admin.get(`/api/admin/audit-logs?action=person.update&targetId=${person._id}`)
    expect(logs.status).toBe(200)
    const log = logs.body.data.logs[0]
    expect(log.actorEmail).toBe(adminUser.email)
    expect(log.before.city).toBe('Karachi')
    expect(log.after.city).toBe('Lahore')

    // Owner ki edit admin action nahi
    const { agent: owner, user: ownerUser } = await loginAs(app, 'talent')
    const { Person } = await import('../src/models/Person')
    await Person.updateOne({ _id: person._id }, { $set: { claimedBy: ownerUser._id } })
    await owner.patch(`/api/people/${person._id}`).send({ bio: 'my bio' })
    const after = await admin.get(`/api/admin/audit-logs?targetId=${person._id}`)
    expect(after.body.meta.total).toBe(1)
  })

  it('names quick hide and show toggles separately', async () => {
    const { agent: admin } = await loginAs(app, 'admin')
    const { user: owner } = await loginAs(app, 'talent')
    const person = await createPerson({ claimedBy: owner._id, verified: true })

    await admin.patch(`/api/people/${person._id}`).send({ visibility: 'hidden' })
    await admin.patch(`/api/people/${person._id}`).send({ visibility: 'visible' })

    const logs = await admin.get(`/api/admin/audit-logs?targetId=${person._id}`)
    const actions = logs.body.data.logs.map((l: { action: string }) => l.action).sort()
    expect(actions).toEqual(['person.hide', 'person.unhide'])
  })

  it('never stores claim codes', async () => {
    const { ProfileClaim } = await import('../src/models/ProfileClaim')
    const { agent } = await loginAs(app, 'admin')
    const { user: talent } = await loginAs(app, 'talent')
    const person = await createPerson()
    const claim = await ProfileClaim.create({ person: person._id, user: talent._id, evidence: { links: ['https://x.com/t'] } })
    const sent = await agent.post(`/api/admin/claims/${claim._id}/code`).send({ channelUrl: 'https://x.com/t' })
    expect(sent.status).toBe(200)
    const logs = await agent.get(`/api/admin/audit-logs?action=claim.send_code&targetId=${claim._id}`)
    expect(JSON.stringify(logs.body.data.logs)).not.toContain(sent.body.data.code)
    expect(JSON.stringify(logs.body.data.logs)).not.toContain('codeHash')
  })

  it('blocks non-admins', async () => {
    const { agent } = await loginAs(app, 'organization')
    expect((await agent.get('/api/admin/audit-logs')).status).toBe(403)
  })
})

describe('admin stats', () => {
  it('returns platform numbers', async () => {
    const { agent } = await loginAs(app, 'admin')
    const res = await agent.get('/api/admin/stats')
    expect(res.status).toBe(200)
    expect(res.body.data.people.total).toBeGreaterThan(0)
    expect(res.body.data.users.byRole.admin).toBeGreaterThan(0)
    expect(res.body.data).toHaveProperty('claims.needsAction')
    expect(res.body.data).toHaveProperty('reports.open')
  })

  it('blocks non-admins', async () => {
    const { agent } = await loginAs(app, 'talent')
    expect((await agent.get('/api/admin/stats')).status).toBe(403)
  })
})
