import type { Express } from 'express'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('people_verify')
})
afterAll(teardownDb)

describe('verified badge follows the claim', () => {
  it('admin cannot verify or unverify by hand', async () => {
    const { agent } = await loginAs(app, 'admin')
    const { user } = await loginAs(app, 'talent')
    const unclaimed = await createPerson()
    const verify = await agent.patch(`/api/people/${unclaimed._id}`).send({ verified: true })
    expect(verify.status).toBe(409)
    expect(verify.body.error.code).toBe('AUTO_VERIFIED')

    const claimed = await createPerson({ claimedBy: user._id, verified: true })
    const unverify = await agent.patch(`/api/people/${claimed._id}`).send({ verified: false })
    expect(unverify.body.error.code).toBe('AUTO_VERIFIED')
    // Hide / show (moderation) ab bhi chalta hai
    const hide = await agent.patch(`/api/people/${claimed._id}`).send({ visibility: 'hidden' })
    expect(hide.status).toBe(200)
  })

  it('blocks creating a profile as verified', async () => {
    const { agent } = await loginAs(app, 'admin')
    const res = await agent.post('/api/people').send({
      name: 'New Verified',
      verified: true,
      sourceRecords: [{ sourceType: 'admin' }],
    })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('PROFILE_NOT_CLAIMED')
  })

  it('brings old data in line: claimed = verified, unclaimed = not verified', async () => {
    const { syncVerifiedWithClaims } = await import('../src/services/personModerationService')
    const { Person } = await import('../src/models/Person')
    const { user } = await loginAs(app, 'talent')
    const unclaimed = await createPerson({ verified: true })
    const claimed = await createPerson({ verified: false, claimedBy: user._id })
    await syncVerifiedWithClaims()
    expect((await Person.findById(unclaimed._id))?.verified).toBe(false)
    expect((await Person.findById(claimed._id))?.verified).toBe(true)
  })
})
