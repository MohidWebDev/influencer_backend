import type { Express } from 'express'
import request from 'supertest'
import type TestAgent from 'supertest/lib/agent'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

// Asal email nahi bhejni: bheji hui emails yahan jama hoti hain
const sent: { to: string; subject: string; text: string }[] = []
jest.mock('../src/services/mailService', () => ({
  isMailConfigured: () => true,
  sendMail: jest.fn(async (message: { to: string; subject: string; text: string }) => {
    sent.push(message)
  }),
}))

let app: Express

beforeAll(async () => {
  app = await setupApp('agreements')
})
afterAll(teardownDb)

const codeFor = (email: string) => {
  const mail = [...sent].reverse().find((m) => m.to === email && /code to sign/.test(m.subject))
  return mail?.text.match(/\b(\d{6})\b/)?.[1] ?? ''
}

const terms = {
  title: 'Spring campaign',
  scope: 'Three Instagram posts and two stories about our spring snacks.',
  currency: 'PKR',
  milestones: [
    { title: 'Concept and script', amount: 50000 },
    { title: 'Posts published', amount: 100000, dueDate: '2030-04-01' },
  ],
  paymentTerms: '50% after the concept, the rest after publishing.',
  usageRights: 'The brand may repost the content for 6 months.',
  revisions: 1,
}

// Verified business + verified talent + accept ki hui hire request
async function acceptedHire() {
  const { BusinessProfile } = await import('../src/models/BusinessProfile')
  const business = await loginAs(app, 'business')
  await BusinessProfile.create({
    owner: business.user._id,
    companyName: 'Acme Foods',
    websiteUrl: 'https://acme.example.com',
    country: 'PK',
    status: 'approved',
  })
  const talent = await loginAs(app, 'talent')
  const person = await createPerson({ claimedBy: talent.user._id, verified: true })
  const hire = await business.agent.post('/api/business/hires').send({
    personId: String(person._id),
    title: 'Spring campaign',
    message: 'We would love you to front our spring snack campaign on Instagram.',
  })
  await talent.agent.patch(`/api/me/hire-requests/${hire.body.data.hire._id}`).send({ action: 'accept' })
  return { business, talent, person, hireId: hire.body.data.hire._id as string }
}

async function sign(agent: TestAgent, email: string, id: string) {
  const asked = await agent.post(`/api/agreements/${id}/sign/code`)
  expect(asked.status).toBe(200)
  return agent.post(`/api/agreements/${id}/sign`).send({ code: codeFor(email) })
}

// Dono ke sign: active muahida
async function activeAgreement() {
  const parties = await acceptedHire()
  const created = await parties.business.agent.post('/api/agreements').send({ hireId: parties.hireId, terms })
  const id = created.body.data.agreement._id as string
  await sign(parties.business.agent, parties.business.user.email, id)
  const done = await sign(parties.talent.agent, parties.talent.user.email, id)
  expect(done.body.data.agreement.status).toBe('active')
  return { ...parties, id }
}

describe('agreements', () => {
  it('only allows an agreement after the talent accepted the hire request', async () => {
    const { BusinessProfile } = await import('../src/models/BusinessProfile')
    const business = await loginAs(app, 'business')
    await BusinessProfile.create({
      owner: business.user._id,
      companyName: 'Beta Ltd',
      websiteUrl: 'https://beta.example.com',
      country: 'PK',
      status: 'approved',
    })
    const talent = await loginAs(app, 'talent')
    const person = await createPerson({ claimedBy: talent.user._id, verified: true })
    const hire = await business.agent.post('/api/business/hires').send({
      personId: String(person._id),
      title: 'Launch event',
      message: 'Please host our launch event next month in Lahore.',
    })
    const early = await business.agent.post('/api/agreements').send({ hireId: hire.body.data.hire._id, terms })
    expect(early.status).toBe(409)
    expect(early.body.error.code).toBe('HIRE_NOT_ACCEPTED')
    expect((await talent.agent.post('/api/agreements').send({ hireId: hire.body.data.hire._id, terms })).status).toBe(403)
  })

  it('negotiates, signs with emailed codes and locks the terms', async () => {
    const { business, talent, hireId } = await acceptedHire()

    const bad = await business.agent.post('/api/agreements').send({ hireId, terms: { ...terms, milestones: [] } })
    expect(bad.status).toBe(400)

    const created = await business.agent.post('/api/agreements').send({ hireId, terms })
    expect(created.status).toBe(201)
    const id = created.body.data.agreement._id
    expect(created.body.data.agreement.status).toBe('negotiating')
    expect(created.body.data.agreement.version).toBe(1)
    expect((await business.agent.post('/api/agreements').send({ hireId, terms })).body.error.code).toBe('AGREEMENT_EXISTS')
    expect((await talent.agent.get('/api/notifications')).body.data.notifications[0].type).toBe('agreement.proposed')

    // Business sign karta hai, phir talent shartein badal deta hai: business ka sign khatam
    const businessSigned = await sign(business.agent, business.user.email, id)
    expect(businessSigned.body.data.agreement.signatures.business.version).toBe(1)
    expect(businessSigned.body.data.agreement.signCodes).toBeUndefined()

    const countered = await talent.agent
      .put(`/api/agreements/${id}/terms`)
      .send({ terms: { ...terms, revisions: 2 } })
    expect(countered.body.data.agreement.version).toBe(2)
    expect(countered.body.data.agreement.proposedBy).toBe('talent')
    expect(countered.body.data.agreement.signatures.business).toBeUndefined()
    expect(countered.body.data.agreement.history).toHaveLength(2)

    // Ghalat code, phir sahi
    await talent.agent.post(`/api/agreements/${id}/sign/code`)
    const real = codeFor(talent.user.email)
    const wrong = await talent.agent.post(`/api/agreements/${id}/sign`).send({ code: real === '000000' ? '111111' : '000000' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.details.attemptsLeft).toBe(4)
    const tooSoon = await talent.agent.post(`/api/agreements/${id}/sign/code`)
    expect(tooSoon.status).toBe(429)
    const talentSigned = await talent.agent.post(`/api/agreements/${id}/sign`).send({ code: real })
    expect(talentSigned.body.data.agreement.status).toBe('negotiating')

    const active = await sign(business.agent, business.user.email, id)
    const agreement = active.body.data.agreement
    expect(agreement.status).toBe('active')
    expect(agreement.signedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(agreement.work).toHaveLength(2)
    expect(agreement.signatures.talent.version).toBe(2)
    expect(agreement.signatures.business.version).toBe(2)

    // Sign ke baad shartein nahi badalti
    const locked = await talent.agent.put(`/api/agreements/${id}/terms`).send({ terms })
    expect(locked.status).toBe(409)
    expect((await business.agent.post(`/api/agreements/${id}/cancel`)).status).toBe(409)

    // Sirf dono taraf dekh sakte hain
    const stranger = await loginAs(app, 'talent')
    expect((await stranger.agent.get(`/api/agreements/${id}`)).status).toBe(404)
    expect((await talent.agent.get('/api/agreements')).body.data.agreements[0]._id).toBe(id)
  })

  it('tracks milestones with revisions until completed, then takes reviews', async () => {
    const { business, talent, person, id } = await activeAgreement()

    expect((await business.agent.post(`/api/agreements/${id}/milestones/0/deliver`).send({ note: 'Done' })).status).toBe(403)
    const delivered = await talent.agent
      .post(`/api/agreements/${id}/milestones/0/deliver`)
      .send({ note: 'Concept attached', link: 'https://drive.example.com/concept' })
    expect(delivered.body.data.agreement.work[0].status).toBe('delivered')

    const changes = await business.agent
      .post(`/api/agreements/${id}/milestones/0/request-changes`)
      .send({ note: 'Please use our new logo' })
    expect(changes.body.data.agreement.work[0].status).toBe('pending')
    expect(changes.body.data.agreement.revisionsUsed).toBe(1)

    await talent.agent.post(`/api/agreements/${id}/milestones/0/deliver`).send({ note: 'New logo used' })
    const noMore = await business.agent
      .post(`/api/agreements/${id}/milestones/0/request-changes`)
      .send({ note: 'One more change' })
    expect(noMore.body.error.code).toBe('NO_REVISIONS_LEFT')

    await business.agent.post(`/api/agreements/${id}/milestones/0/approve`)
    expect((await business.agent.post(`/api/agreements/${id}/review`).send({ rating: 5 })).status).toBe(409)
    await talent.agent.post(`/api/agreements/${id}/milestones/1/deliver`).send({ note: 'Posts are live' })
    const done = await business.agent.post(`/api/agreements/${id}/milestones/1/approve`)
    expect(done.body.data.agreement.status).toBe('completed')

    await business.agent.post(`/api/agreements/${id}/review`).send({ rating: 5, comment: 'Great to work with' })
    expect((await business.agent.post(`/api/agreements/${id}/review`).send({ rating: 4 })).status).toBe(409)
    await talent.agent.post(`/api/agreements/${id}/review`).send({ rating: 4 })

    const reviews = await request(app).get(`/api/people/${person.slug}/reviews`)
    expect(reviews.body.data.rating).toEqual({ average: 5, count: 1 })
    expect(reviews.body.data.reviews[0].business).toBe('Acme Foods')

    const inbox = await talent.agent.get('/api/me/hire-requests')
    expect(inbox.body.data.hires[0].businessRating).toEqual({ average: 4, count: 1 })
    expect(inbox.body.data.hires[0].agreement).toBe(id)
  })

  it('lets either side open a dispute that an admin resolves', async () => {
    const { business, talent, id } = await activeAgreement()
    const { agent: admin } = await loginAs(app, 'admin')

    const dispute = await talent.agent
      .post(`/api/agreements/${id}/dispute`)
      .send({ reason: 'The business stopped answering after the first delivery.' })
    expect(dispute.body.data.agreement.status).toBe('disputed')
    expect((await admin.get('/api/notifications')).body.data.notifications[0].type).toBe('agreement.disputed_admin')
    expect((await admin.get('/api/admin/stats')).body.data.agreements.disputed).toBeGreaterThan(0)
    expect((await talent.agent.post(`/api/agreements/${id}/milestones/0/deliver`).send({ note: 'x x x' })).status).toBe(409)

    const resolved = await admin
      .post(`/api/admin/agreements/${id}/resolve`)
      .send({ outcome: 'continue', note: 'Both sides agreed to continue.' })
    expect(resolved.body.data.agreement.status).toBe('active')
    expect(resolved.body.data.agreement.dispute.outcome).toBe('continue')
    const detail = await admin.get(`/api/admin/agreements/${id}`)
    expect(detail.body.data.history.map((h: { action: string }) => h.action)).toContain('agreement.resolve')
    expect((await business.agent.get('/api/notifications')).body.data.notifications[0].type).toBe('agreement.resolved')
  })

  it('blocks deleting an account with an active agreement', async () => {
    const { talent } = await activeAgreement()
    const res = await talent.agent.delete('/api/auth/account').send({ confirm: `delete ${talent.user.name}` })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ACTIVE_AGREEMENT')
  })
})
