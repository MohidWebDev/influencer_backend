import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('admin_claims')
})
afterAll(teardownDb)

async function makeVerifiedClaim() {
  const { ProfileClaim } = await import('../src/models/ProfileClaim')
  const person = await createPerson()
  const { user: talent } = await loginAs(app, 'talent')
  const claim = await ProfileClaim.create({
    person: person._id,
    user: talent._id,
    status: 'code_verified',
    evidence: { links: ['https://instagram.com/test'] },
    verification: { channelUrl: 'https://instagram.com/test', attempts: 0, verifiedAt: new Date() },
  })
  return { person, talent, claim }
}

describe('admin claims', () => {
  it('lists claims, shows detail and approves with an audit log (admin)', async () => {
    const { person, talent, claim } = await makeVerifiedClaim()
    const { agent } = await loginAs(app, 'admin')

    const list = await agent.get('/api/admin/claims?status=code_verified')
    expect(list.status).toBe(200)
    expect(list.body.success).toBe(true)
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1)

    const detail = await agent.get(`/api/admin/claims/${claim._id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.claim.person.name).toBe(person.name)
    expect(detail.body.data.claim.user.email).toBe(talent.email)

    const approve = await agent.patch(`/api/admin/claims/${claim._id}`).send({ action: 'approve' })
    expect(approve.status).toBe(200)
    expect(approve.body.data.claim.status).toBe('approved')

    const { Person } = await import('../src/models/Person')
    const updated = await Person.findById(person._id)
    expect(updated?.claimedBy?.toString()).toBe(talent._id.toString())

    const logs = await agent.get(`/api/admin/audit-logs?targetType=claim&targetId=${claim._id}`)
    expect(logs.body.data.logs[0].action).toBe('claim.approve')
    expect(logs.body.data.logs[0].before.status).toBe('code_verified')
    expect(logs.body.data.logs[0].after.status).toBe('approved')
  })

  it('rejects with a reason and records it', async () => {
    const { claim } = await makeVerifiedClaim()
    const { agent } = await loginAs(app, 'admin')
    const res = await agent
      .patch(`/api/admin/claims/${claim._id}`)
      .send({ action: 'reject', reason: 'Could not verify' })
    expect(res.status).toBe(200)
    expect(res.body.data.claim.rejectionReason).toBe('Could not verify')
  })

  it('blocks non-admins and guests', async () => {
    const { claim } = await makeVerifiedClaim()
    const { agent } = await loginAs(app, 'talent')
    expect((await agent.get('/api/admin/claims')).status).toBe(403)
    expect((await agent.get(`/api/admin/claims/${claim._id}`)).status).toBe(403)
    expect((await agent.patch(`/api/admin/claims/${claim._id}`).send({ action: 'approve' })).status).toBe(403)
    expect((await request(app).get('/api/admin/claims')).status).toBe(401)
  })

  it('validates the status filter', async () => {
    const { agent } = await loginAs(app, 'admin')
    const res = await agent.get('/api/admin/claims?status=nope')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
