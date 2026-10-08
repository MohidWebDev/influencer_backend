import type { Express } from 'express'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('claims_otp')
})
afterAll(teardownDb)

const LINK = 'https://instagram.com/otp-test'

// Talent claim bhejta hai, admin code bhejta hai
async function claimWithCode() {
  const person = await createPerson()
  const talent = await loginAs(app, 'talent')
  const admin = await loginAs(app, 'admin')
  // Form se koi aur email bheje to bhi claim pe login wali email hi lagti hai
  const created = await talent.agent
    .post('/api/claims')
    .send({ personId: person._id, links: [LINK], contactEmail: 'someone-else@example.com' })
  expect(created.status).toBe(201)
  expect(created.body.data.claim.evidence.contactEmail).toBe(talent.user.email)
  const id = created.body.data.claim._id as string
  const sent = await admin.agent.post(`/api/admin/claims/${id}/code`).send({ channelUrl: LINK })
  expect(sent.status).toBe(200)
  expect(sent.body.data.claim.status).toBe('waiting_for_talent')
  return { person, talent, admin, id, code: sent.body.data.code as string }
}

const wrong = (code: string) => (code === '000000' ? '111111' : '000000')

describe('claim OTP', () => {
  it('counts wrong attempts, locks on the 5th and blocks more attempts', async () => {
    const { talent, admin, id, code } = await claimWithCode()

    for (let i = 1; i <= 4; i++) {
      const res = await talent.agent.post(`/api/claims/${id}/verify`).send({ code: wrong(code) })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_CODE')
      expect(res.body.error.details.attemptsLeft).toBe(5 - i)
    }
    const fifth = await talent.agent.post(`/api/claims/${id}/verify`).send({ code: wrong(code) })
    expect(fifth.status).toBe(423)
    expect(fifth.body.error.code).toBe('OTP_LOCKED')

    // Ab sahi code bhi qabool nahi
    const after = await talent.agent.post(`/api/claims/${id}/verify`).send({ code })
    expect(after.body.error.code).toBe('OTP_LOCKED')

    const detail = await admin.agent.get(`/api/admin/claims/${id}`)
    expect(detail.body.data.claim.status).toBe('otp_failed')
    expect(detail.body.data.claim.otpAttempts).toBe(5)
    expect(detail.body.data.claim.otpLockedAt).toBeTruthy()

    const list = await admin.agent.get('/api/admin/claims?status=otp_failed')
    expect(list.body.data.claims.map((c: { _id: string }) => c._id)).toContain(id)

    const logs = await admin.agent.get(`/api/admin/audit-logs?action=claim.otp_locked&targetId=${id}`)
    expect(logs.body.meta.total).toBe(1)
  })

  it('reset unlocks the claim and sends a new code', async () => {
    const { talent, admin, id, code } = await claimWithCode()
    for (let i = 0; i < 5; i++) {
      await talent.agent.post(`/api/claims/${id}/verify`).send({ code: wrong(code) })
    }
    const reset = await admin.agent.post(`/api/admin/claims/${id}/reset-otp`).send({})
    expect(reset.status).toBe(200)
    expect(reset.body.data.claim.status).toBe('waiting_for_talent')
    expect(reset.body.data.claim.otpAttempts).toBe(0)
    expect(reset.body.data.claim.otpLockedAt).toBeUndefined()
    expect(reset.body.data.code).toMatch(/^\d{6}$/)

    const ok = await talent.agent.post(`/api/claims/${id}/verify`).send({ code: reset.body.data.code })
    expect(ok.status).toBe(200)
    expect(ok.body.data.claim.status).toBe('verified')
    expect(ok.body.data.claim.verificationMethod).toBe('otp')
    expect(ok.body.data.claim.verifiedBy).toBeNull()

    const logs = await admin.agent.get(`/api/admin/audit-logs?action=claim.reset_otp&targetId=${id}`)
    expect(logs.body.meta.total).toBe(1)
  })

  it('admin can verify manually from otp_failed, which approves the claim', async () => {
    const { person, talent, admin, id, code } = await claimWithCode()
    for (let i = 0; i < 5; i++) {
      await talent.agent.post(`/api/claims/${id}/verify`).send({ code: wrong(code) })
    }
    const res = await admin.agent.post(`/api/admin/claims/${id}/verify-manual`).send({})
    expect(res.status).toBe(200)
    const claim = res.body.data.claim
    expect(claim.status).toBe('approved')
    expect(claim.verificationMethod).toBe('admin_manual')
    expect(claim.verifiedBy.email).toBe(admin.user.email)
    expect(claim.verifiedAt).toBeTruthy()

    const { Person } = await import('../src/models/Person')
    expect((await Person.findById(person._id))?.claimedBy?.toString()).toBe(talent.user._id.toString())
    // Claim approve = profile khud verified
    expect((await Person.findById(person._id))?.verified).toBe(true)

    // Approved claim "all" list mein dikhta rehta hai
    const all = await admin.agent.get('/api/admin/claims?status=all&limit=50')
    expect(all.body.data.claims.map((c: { _id: string }) => c._id)).toContain(id)

    const logs = await admin.agent.get(`/api/admin/audit-logs?action=claim.verify_manual&targetId=${id}`)
    expect(logs.body.meta.total).toBe(1)
  })

  it('does not allow manual verify from pending, and blocks non-admins', async () => {
    const person = await createPerson()
    const talent = await loginAs(app, 'talent')
    const admin = await loginAs(app, 'admin')
    const created = await talent.agent.post('/api/claims').send({ personId: person._id, links: [LINK] })
    const id = created.body.data.claim._id
    expect((await admin.agent.post(`/api/admin/claims/${id}/verify-manual`).send({})).status).toBe(409)
    expect((await talent.agent.post(`/api/admin/claims/${id}/verify-manual`).send({})).status).toBe(403)
    expect((await talent.agent.post(`/api/admin/claims/${id}/reset-otp`).send({})).status).toBe(403)
  })

  it('migrates old claims to the new statuses and fields', async () => {
    const { ProfileClaim, migrateLegacyClaims } = await import('../src/models/ProfileClaim')
    const person = await createPerson()
    const { user } = await loginAs(app, 'talent')
    const verifiedAt = new Date('2026-01-01')
    const { insertedIds } = await ProfileClaim.collection.insertMany([
      { person: person._id, user: user._id, status: 'code_sent', evidence: { links: [LINK] }, verification: { attempts: 2 } },
      { person: person._id, user: user._id, status: 'code_verified', evidence: { links: [LINK] }, verification: { attempts: 0, verifiedAt } },
    ])
    await migrateLegacyClaims()
    const sent = await ProfileClaim.findById(insertedIds[0]).lean()
    const done = await ProfileClaim.findById(insertedIds[1]).lean()
    expect(sent?.status).toBe('waiting_for_talent')
    expect(sent?.otpAttempts).toBe(2)
    expect(done?.status).toBe('verified')
    expect(done?.verificationMethod).toBe('otp')
    expect(done?.verifiedAt?.toISOString()).toBe(verifiedAt.toISOString())
  })

  it('rejects open claims whose profile was deleted, so lists do not break', async () => {
    const { ProfileClaim, migrateLegacyClaims } = await import('../src/models/ProfileClaim')
    const { Person } = await import('../src/models/Person')
    const person = await createPerson()
    const { user } = await loginAs(app, 'talent')
    const claim = await ProfileClaim.create({ person: person._id, user: user._id, evidence: { links: [LINK] } })
    await Person.deleteOne({ _id: person._id })

    await migrateLegacyClaims()
    const after = await ProfileClaim.findById(claim._id).lean()
    expect(after?.status).toBe('rejected')
    expect(after?.rejectionReason).toBe('This profile was removed')
  })
})
