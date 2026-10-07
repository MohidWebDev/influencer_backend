import type { Express } from 'express'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('claims_new_profile')
})
afterAll(teardownDb)

let n = 0
function body(extra: Record<string, unknown> = {}) {
  n += 1
  return {
    name: `Brand New Talent ${n}`,
    headline: 'Podcaster',
    country: 'PK',
    city: 'Lahore',
    socialAccounts: [{ platform: 'instagram', url: `https://instagram.com/new_talent_${n}`, followers: 5000 }],
    note: 'I am not listed yet',
    ...extra,
  }
}

describe('talent submits a new profile', () => {
  it('creates a hidden draft with a claim, and publishes it on approval', async () => {
    const talent = await loginAs(app, 'talent')
    const admin = await loginAs(app, 'admin')

    const res = await talent.agent.post('/api/claims/new-profile').send(body())
    expect(res.status).toBe(201)
    const claim = res.body.data.claim
    expect(claim.isNewProfile).toBe(true)
    expect(claim.status).toBe('pending')
    expect(claim.evidence.links).toHaveLength(1)

    const { Person } = await import('../src/models/Person')
    const draft = await Person.findById(claim.person._id)
    expect(draft?.visibility).toBe('hidden')
    expect(draft?.isDraft).toBe(true)
    expect(draft?.sourceRecords[0].sourceType).toBe('self_submitted')

    // Public pe nahi dikhti
    expect((await talent.agent.get(`/api/people/${draft!.slug}`)).status).toBe(404)
    // Admin ke "new_profiles" filter mein hai
    const list = await admin.agent.get('/api/admin/claims?status=new_profiles')
    expect(list.body.data.claims.map((c: { _id: string }) => c._id)).toContain(claim._id)
    // Admin haath se public nahi kar sakta
    const show = await admin.agent.patch(`/api/people/${draft!._id}`).send({ visibility: 'visible' })
    expect(show.status).toBe(409)
    expect(show.body.error.code).toBe('PROFILE_PENDING_REVIEW')

    // Wahi OTP flow
    const sent = await admin.agent
      .post(`/api/admin/claims/${claim._id}/code`)
      .send({ channelUrl: claim.evidence.links[0] })
    const ok = await talent.agent.post(`/api/claims/${claim._id}/verify`).send({ code: sent.body.data.code })
    expect(ok.body.data.claim.status).toBe('verified')
    const approve = await admin.agent.patch(`/api/admin/claims/${claim._id}`).send({ action: 'approve' })
    expect(approve.status).toBe(200)

    const published = await Person.findById(claim.person._id)
    expect(published?.visibility).toBe('visible')
    expect(published?.isDraft).toBe(false)
    expect(published?.claimedBy?.toString()).toBe(talent.user._id.toString())
    expect((await talent.agent.get(`/api/people/${published!.slug}`)).status).toBe(200)
  })

  it('warns about a matching public profile unless forced', async () => {
    const existing = await createPerson({
      name: 'Famous Singer',
      socialAccounts: [{ platform: 'youtube', url: 'https://www.youtube.com/@famoussinger' }],
    })
    const talent = await loginAs(app, 'talent')

    // Wahi link (thodi alag shakal mein)
    const dup = await talent.agent.post('/api/claims/new-profile').send(
      body({
        name: 'F. Singer',
        socialAccounts: [{ platform: 'youtube', url: 'http://youtube.com/@FamousSinger/' }],
      }),
    )
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('POSSIBLE_DUPLICATE')
    expect(dup.body.error.details.matches[0].slug).toBe(existing.slug)

    // Wahi naam
    const byName = await talent.agent.post('/api/claims/new-profile').send(body({ name: 'famous singer' }))
    expect(byName.body.error.code).toBe('POSSIBLE_DUPLICATE')

    const forced = await talent.agent
      .post('/api/claims/new-profile')
      .send(body({ name: 'famous singer', force: true }))
    expect(forced.status).toBe(201)

    // Ek waqt mein ek hi khula claim
    const again = await talent.agent.post('/api/claims/new-profile').send(body())
    expect(again.body.error.code).toBe('CLAIM_PENDING')
  })

  it('deletes the draft when the claim is rejected', async () => {
    const talent = await loginAs(app, 'talent')
    const admin = await loginAs(app, 'admin')
    const res = await talent.agent.post('/api/claims/new-profile').send(body())
    const claim = res.body.data.claim
    const reject = await admin.agent.patch(`/api/admin/claims/${claim._id}`).send({ action: 'reject' })
    expect(reject.status).toBe(200)
    const { Person } = await import('../src/models/Person')
    expect(await Person.findById(claim.person._id)).toBeNull()
    // Talent ko naam phir bhi dikhe
    const mine = await talent.agent.get('/api/claims/mine')
    expect(mine.body.data.claims[0].requestedName).toBe(claim.requestedName)
  })

  it('needs at least one social account and a talent account', async () => {
    const talent = await loginAs(app, 'talent')
    const bad = await talent.agent.post('/api/claims/new-profile').send(body({ socialAccounts: [] }))
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields.socialAccounts).toBeTruthy()

    const business = await loginAs(app, 'business')
    expect((await business.agent.post('/api/claims/new-profile').send(body())).status).toBe(403)
  })
})
