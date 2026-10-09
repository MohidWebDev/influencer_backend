import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('business')
})
afterAll(teardownDb)

const company = {
  companyName: 'Acme Foods',
  industry: 'Food & beverage',
  companySize: '51-200',
  description: 'We make snacks.',
  websiteUrl: 'https://acme.example.com',
  registrationNumber: 'NTN-1234567',
  country: 'pk',
  city: 'Lahore',
  contactPhone: '+92 300 1234567',
  proofLinks: ['https://www.linkedin.com/company/acme'],
}

const hireBody = (personId: string) => ({
  personId,
  title: 'Spring campaign',
  message: 'We would love you to front our spring snack campaign on Instagram.',
  budget: { amount: 150000, currency: 'PKR' },
})

// Poora raasta: details -> admin code bhejta hai -> business code daalta hai -> admin approve
async function verifiedBusiness() {
  const business = await loginAs(app, 'business')
  const created = await business.agent.put('/api/business/profile').send(company)
  const businessId = created.body.data.business._id as string
  const { agent: admin } = await loginAs(app, 'admin')
  const sent = await admin.post(`/api/admin/businesses/${businessId}/code`).send({ channel: company.websiteUrl })
  await business.agent.post('/api/business/profile/verify').send({ code: sent.body.data.code })
  await admin.patch(`/api/admin/businesses/${businessId}`).send({ action: 'approve' })
  return { ...business, businessId, admin }
}

async function verifiedTalent() {
  const talent = await loginAs(app, 'talent')
  const person = await createPerson({ claimedBy: talent.user._id, verified: true, status: 'contactable' })
  return { ...talent, person }
}

describe('business verification', () => {
  it('only business accounts can use the business API', async () => {
    const { agent } = await loginAs(app, 'talent')
    expect((await agent.get('/api/business/profile')).status).toBe(403)
    expect((await request(app).get('/api/business/profile')).status).toBe(401)
  })

  it('runs the code flow: send code, business enters it, admin approves', async () => {
    const { agent: admin } = await loginAs(app, 'admin')
    const { agent, user } = await loginAs(app, 'business')

    expect((await agent.get('/api/business/profile')).body.data.business).toBeNull()

    const bad = await agent.put('/api/business/profile').send({ ...company, websiteUrl: 'nope' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields.websiteUrl).toBeTruthy()

    const created = await agent.put('/api/business/profile').send(company)
    expect(created.status).toBe(201)
    const business = created.body.data.business
    expect(business.status).toBe('pending')
    expect(business.country).toBe('PK')

    const notes = await admin.get('/api/notifications')
    expect(notes.body.data.notifications[0].type).toBe('business.new')
    expect(notes.body.data.notifications[0].link).toBe(`/admin/businesses/${business._id}`)
    expect((await admin.get('/api/admin/stats')).body.data.businesses.needsAction).toBeGreaterThan(0)
    const queue = await admin.get('/api/admin/businesses?status=needs_action')
    expect(queue.body.data.businesses.map((b: { _id: string }) => b._id)).toContain(business._id)

    // Approve sirf sahi code ke baad
    const early = await admin.patch(`/api/admin/businesses/${business._id}`).send({ action: 'approve' })
    expect(early.status).toBe(409)
    expect(early.body.error.code).toBe('BUSINESS_CODE_NOT_VERIFIED')

    const detail = await admin.get(`/api/admin/businesses/${business._id}`)
    expect(detail.body.data.channels).toEqual(
      expect.arrayContaining([user.email, company.websiteUrl, company.contactPhone, ...company.proofLinks]),
    )
    const badChannel = await admin.post(`/api/admin/businesses/${business._id}/code`).send({ channel: 'https://evil.example.com' })
    expect(badChannel.status).toBe(400)

    const sent = await admin.post(`/api/admin/businesses/${business._id}/code`).send({ channel: user.email })
    expect(sent.status).toBe(200)
    expect(sent.body.data.code).toMatch(/^\d{6}$/)
    expect(sent.body.data.business.status).toBe('waiting_for_business')
    expect(sent.body.data.business.verification.codeHash).toBeUndefined()

    const mine = await agent.get('/api/business/profile')
    expect(mine.body.data.business.verification.channel).toBe(user.email)
    expect(mine.body.data.business.verification.codeHash).toBeUndefined()
    expect((await agent.get('/api/notifications')).body.data.notifications[0].type).toBe('business.code_sent')

    const wrong = await agent.post('/api/business/profile/verify').send({ code: sent.body.data.code === '000000' ? '111111' : '000000' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.details.attemptsLeft).toBe(4)

    const right = await agent.post('/api/business/profile/verify').send({ code: sent.body.data.code })
    expect(right.status).toBe(200)
    expect(right.body.data.business.status).toBe('code_verified')
    expect((await admin.get('/api/notifications')).body.data.notifications[0].type).toBe('business.code_verified')

    const approved = await admin.patch(`/api/admin/businesses/${business._id}`).send({ action: 'approve' })
    expect(approved.status).toBe(200)
    expect(approved.body.data.business.status).toBe('approved')
    expect(
      (await admin.patch(`/api/admin/businesses/${business._id}`).send({ action: 'approve' })).status,
    ).toBe(409)

    const history = (await admin.get(`/api/admin/businesses/${business._id}`)).body.data.history
    expect(history.map((h: { action: string }) => h.action)).toEqual(['business.approve', 'business.send_code'])
    expect((await agent.get('/api/notifications')).body.data.notifications[0].type).toBe('business.approved')
  })

  it('locks after 5 wrong codes; the admin can reset or verify manually', async () => {
    const { agent: admin } = await loginAs(app, 'admin')
    const { agent } = await loginAs(app, 'business')
    const id = (await agent.put('/api/business/profile').send(company)).body.data.business._id
    expect((await agent.post('/api/business/profile/verify').send({ code: '123456' })).body.error.code).toBe('NO_ACTIVE_CODE')

    const sent = await admin.post(`/api/admin/businesses/${id}/code`).send({ channel: company.websiteUrl })
    const wrongCode = sent.body.data.code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 4; i++) {
      expect((await agent.post('/api/business/profile/verify').send({ code: wrongCode })).status).toBe(400)
    }
    const locked = await agent.post('/api/business/profile/verify').send({ code: wrongCode })
    expect(locked.status).toBe(423)
    expect(locked.body.error.code).toBe('OTP_LOCKED')
    // Lock ke baad sahi code bhi nahi chalta
    expect((await agent.post('/api/business/profile/verify').send({ code: sent.body.data.code })).status).toBe(423)
    expect((await admin.get('/api/notifications')).body.data.notifications[0].type).toBe('business.otp_locked')

    const reset = await admin.post(`/api/admin/businesses/${id}/reset-otp`).send({})
    expect(reset.body.data.business.status).toBe('waiting_for_business')
    expect(reset.body.data.business.otpAttempts).toBe(0)
    expect(reset.body.data.business.verification.channel).toBe(company.websiteUrl)

    const manual = await admin.post(`/api/admin/businesses/${id}/verify-manual`)
    expect(manual.status).toBe(200)
    expect(manual.body.data.business.status).toBe('approved')
    expect(manual.body.data.business.verificationMethod).toBe('admin_manual')
  })

  it('rejects with a reason and goes back to pending when resubmitted', async () => {
    const { agent: admin } = await loginAs(app, 'admin')
    const { agent } = await loginAs(app, 'business')
    const id = (await agent.put('/api/business/profile').send(company)).body.data.business._id
    await admin.post(`/api/admin/businesses/${id}/code`).send({ channel: company.websiteUrl })

    const rejected = await admin
      .patch(`/api/admin/businesses/${id}`)
      .send({ action: 'reject', reason: 'Website does not load' })
    expect(rejected.body.data.business.status).toBe('rejected')
    expect(rejected.body.data.business.rejectionReason).toBe('Website does not load')

    const again = await agent.put('/api/business/profile').send({ ...company, websiteUrl: 'https://acme.example.org' })
    expect(again.status).toBe(200)
    expect(again.body.data.business.status).toBe('pending')
    expect(again.body.data.business.rejectionReason).toBeUndefined()
    expect(again.body.data.business.verification.channel).toBeUndefined()
  })

  it('keeps an approved business verified for small edits but re-reviews identity changes', async () => {
    const { agent } = await verifiedBusiness()
    const small = await agent.put('/api/business/profile').send({ ...company, description: 'New text' })
    expect(small.body.data.business.status).toBe('approved')
    const renamed = await agent.put('/api/business/profile').send({ ...company, companyName: 'Acme Global' })
    expect(renamed.body.data.business.status).toBe('pending')
  })
})

describe('hiring', () => {
  it('blocks businesses that are not verified', async () => {
    const { person } = await verifiedTalent()
    const { agent } = await loginAs(app, 'business')
    const none = await agent.post('/api/business/hires').send(hireBody(String(person._id)))
    expect(none.status).toBe(403)
    expect(none.body.error.code).toBe('BUSINESS_NOT_VERIFIED')

    const id = (await agent.put('/api/business/profile').send(company)).body.data.business._id
    const pending = await agent.post('/api/business/hires').send(hireBody(String(person._id)))
    expect(pending.body.error.code).toBe('BUSINESS_NOT_VERIFIED')

    // Sahi code daal diya lekin admin ne abhi approve nahi kiya
    const { agent: admin } = await loginAs(app, 'admin')
    const sent = await admin.post(`/api/admin/businesses/${id}/code`).send({ channel: company.websiteUrl })
    await agent.post('/api/business/profile/verify').send({ code: sent.body.data.code })
    const codeOnly = await agent.post('/api/business/hires').send(hireBody(String(person._id)))
    expect(codeOnly.body.error.code).toBe('BUSINESS_NOT_VERIFIED')
  })

  it('only allows hiring verified talents', async () => {
    const { agent } = await verifiedBusiness()
    const unclaimed = await createPerson()
    const res = await agent.post('/api/business/hires').send(hireBody(String(unclaimed._id)))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('TALENT_NOT_VERIFIED')
  })

  it('sends a request, blocks duplicates, and the talent accepts it', async () => {
    const { agent, user } = await verifiedBusiness()
    const talent = await verifiedTalent()

    const sent = await agent.post('/api/business/hires').send(hireBody(String(talent.person._id)))
    expect(sent.status).toBe(201)
    expect(sent.body.data.hire.status).toBe('pending')
    expect(sent.body.data.hire.person.name).toBe(talent.person.name)

    const twice = await agent.post('/api/business/hires').send(hireBody(String(talent.person._id)))
    expect(twice.status).toBe(409)
    expect(twice.body.error.code).toBe('HIRE_PENDING')

    const inbox = await talent.agent.get('/api/me/hire-requests')
    expect(inbox.body.data.hires).toHaveLength(1)
    expect(inbox.body.data.hires[0].businessProfile.companyName).toBe('Acme Foods')
    // Accept se pehle koi raabta nahi: na phone, na email
    expect(inbox.body.data.hires[0].businessProfile.contactPhone).toBeUndefined()
    expect(inbox.body.data.hires[0].contact).toBeUndefined()
    expect((await agent.get('/api/business/hires')).body.data.hires[0].contact).toBeUndefined()
    const talentNotes = await talent.agent.get('/api/notifications')
    expect(talentNotes.body.data.notifications[0].type).toBe('hire.new')

    const accepted = await talent.agent
      .patch(`/api/me/hire-requests/${sent.body.data.hire._id}`)
      .send({ action: 'accept', note: 'Happy to help' })
    expect(accepted.body.data.hire.status).toBe('accepted')
    // Accept ke baad dono ko ek doosre ka raabta
    expect(accepted.body.data.hire.contact).toEqual({
      name: user.name,
      email: user.email,
      phone: company.contactPhone,
      websiteUrl: company.websiteUrl,
    })
    expect(
      (await talent.agent.patch(`/api/me/hire-requests/${sent.body.data.hire._id}`).send({ action: 'decline' })).status,
    ).toBe(409)

    const mine = await agent.get('/api/business/hires')
    expect(mine.body.data.hires[0].status).toBe('accepted')
    expect(mine.body.data.hires[0].contact).toEqual({ name: talent.user.name, email: talent.user.email })
    expect((await agent.get('/api/notifications')).body.data.notifications[0].type).toBe('hire.accepted')
  })

  it('lets the business cancel a pending request and hides it from other talents', async () => {
    const { agent } = await verifiedBusiness()
    const talent = await verifiedTalent()
    const other = await loginAs(app, 'talent')
    const id = (await agent.post('/api/business/hires').send(hireBody(String(talent.person._id)))).body.data.hire._id

    expect((await other.agent.patch(`/api/me/hire-requests/${id}`).send({ action: 'accept' })).status).toBe(404)
    expect((await other.agent.get('/api/me/hire-requests')).body.data.hires).toHaveLength(0)

    const cancelled = await agent.post(`/api/business/hires/${id}/cancel`)
    expect(cancelled.body.data.hire.status).toBe('cancelled')
    expect((await agent.post(`/api/business/hires/${id}/cancel`)).status).toBe(409)
  })

  it('checks that the chosen service is active', async () => {
    const { agent } = await verifiedBusiness()
    const talent = await verifiedTalent()
    const created = await talent.agent.post('/api/me/services').send({
      title: 'Keynote talk',
      category: 'keynote',
      pricing: { type: 'quote' },
      isActive: false,
    })
    const serviceId = created.body.data.service._id
    const res = await agent
      .post('/api/business/hires')
      .send({ ...hireBody(String(talent.person._id)), serviceId })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.serviceId).toBeTruthy()

    await talent.agent.patch(`/api/me/services/${serviceId}`).send({ isActive: true })
    const ok = await agent.post('/api/business/hires').send({ ...hireBody(String(talent.person._id)), serviceId })
    expect(ok.status).toBe(201)
    expect(ok.body.data.hire.serviceTitle).toBe('Keynote talk')
  })
})
