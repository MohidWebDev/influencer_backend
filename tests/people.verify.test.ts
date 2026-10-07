import type { Express } from 'express'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('people_verify')
})
afterAll(teardownDb)

describe('verified badge needs a claimed profile', () => {
  it('blocks verifying an unclaimed profile', async () => {
    const { agent } = await loginAs(app, 'admin')
    const person = await createPerson()
    const res = await agent.patch(`/api/people/${person._id}`).send({ verified: true })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('PROFILE_NOT_CLAIMED')
  })

  it('allows verifying a claimed profile', async () => {
    const { agent } = await loginAs(app, 'admin')
    const { user } = await loginAs(app, 'talent')
    const person = await createPerson({ claimedBy: user._id })
    const res = await agent.patch(`/api/people/${person._id}`).send({ verified: true })
    expect(res.status).toBe(200)
    expect(res.body.data.person.verified).toBe(true)
  })

  it('always allows removing the badge', async () => {
    const { agent } = await loginAs(app, 'admin')
    const person = await createPerson({ verified: true })
    const res = await agent.patch(`/api/people/${person._id}`).send({ verified: false })
    expect(res.status).toBe(200)
    expect(res.body.data.person.verified).toBe(false)
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

  it('removes the badge from unclaimed profiles in old data', async () => {
    const { unverifyUnclaimedPeople } = await import('../src/services/personModerationService')
    const { Person } = await import('../src/models/Person')
    const { user } = await loginAs(app, 'talent')
    const unclaimed = await createPerson({ verified: true })
    const claimed = await createPerson({ verified: true, claimedBy: user._id })
    await unverifyUnclaimedPeople()
    expect((await Person.findById(unclaimed._id))?.verified).toBe(false)
    expect((await Person.findById(claimed._id))?.verified).toBe(true)
  })
})
