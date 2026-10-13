import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('campaigns')
})
afterAll(teardownDb)

const campaignBody = {
  title: 'Summer snack launch',
  brief: 'We need food creators to post one reel each about our new summer snack range.',
  category: 'brand_campaign',
  budget: { amount: 50000, currency: 'PKR' },
  country: 'pk',
  slots: 2,
}

async function business(status: 'approved' | 'pending' = 'approved') {
  const { BusinessProfile } = await import('../src/models/BusinessProfile')
  const login = await loginAs(app, 'business')
  await BusinessProfile.create({
    owner: login.user._id,
    companyName: 'Acme Foods',
    organizationType: 'brand',
    websiteUrl: 'https://acme.example.com',
    country: 'PK',
    contactPhone: '+92300000000',
    status,
  })
  return login
}

async function talent(withProfile = true) {
  const login = await loginAs(app, 'talent')
  const person = withProfile ? await createPerson({ claimedBy: login.user._id }) : null
  return { ...login, person }
}

describe('campaigns', () => {
  it('only a verified business can publish; others keep a draft', async () => {
    const pending = await business('pending')
    const open = await pending.agent.post('/api/campaigns').send(campaignBody)
    expect(open.status).toBe(403)
    expect(open.body.error.code).toBe('BUSINESS_NOT_VERIFIED')
    const draft = await pending.agent.post('/api/campaigns').send({ ...campaignBody, status: 'draft' })
    expect(draft.status).toBe(201)
    expect(draft.body.data.campaign.status).toBe('draft')
    // Draft public nahi
    expect((await request(app).get(`/api/campaigns/${draft.body.data.campaign._id}`)).status).toBe(404)
    const { agent: t } = await talent()
    expect((await t.post(`/api/campaigns/${draft.body.data.campaign._id}/apply`).send({ pitch: 'I would love to work on this campaign.' })).status).toBe(404)
  })

  it('validates the campaign and blocks other roles', async () => {
    const { agent } = await business()
    const bad = await agent.post('/api/campaigns').send({ title: 'x', brief: 'short', category: 'nope', slots: 0, deadline: '2000-01-01' })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['title', 'brief', 'category', 'slots']))
    const { agent: t } = await talent()
    expect((await t.post('/api/campaigns').send(campaignBody)).status).toBe(403)
  })

  it('runs the open call: publish, list, apply, accept into a hire request, auto close when full', async () => {
    const owner = await business()
    const created = await owner.agent.post('/api/campaigns').send({ ...campaignBody, deadline: null })
    expect(created.status).toBe(201)
    const campaign = created.body.data.campaign
    expect(campaign).toMatchObject({ status: 'open', country: 'PK', acceptingApplications: true })
    expect(campaign.deadline).toBeUndefined()
    expect(campaign.business).toMatchObject({ name: 'Acme Foods', organizationType: 'brand', verified: true })

    const list = await request(app).get('/api/campaigns?country=PK&q=snack')
    expect(list.body.data.campaigns.map((c: { _id: string }) => c._id)).toContain(campaign._id)
    expect(JSON.stringify(list.body)).not.toContain('+92300000000')

    // Profile ke baghair apply nahi
    const noProfile = await talent(false)
    const blocked = await noProfile.agent.post(`/api/campaigns/${campaign._id}/apply`).send({ pitch: 'I would love to work on this campaign.' })
    expect(blocked.body.error.code).toBe('PROFILE_REQUIRED')

    const a = await talent()
    const b = await talent()
    const c = await talent()
    const pitch = { pitch: 'I post food reels every week for 80K followers.' }
    const applied = await a.agent.post(`/api/campaigns/${campaign._id}/apply`).send(pitch)
    expect(applied.status).toBe(201)
    expect((await a.agent.post(`/api/campaigns/${campaign._id}/apply`).send(pitch)).body.error.code).toBe('ALREADY_APPLIED')
    await b.agent.post(`/api/campaigns/${campaign._id}/apply`).send(pitch)
    await c.agent.post(`/api/campaigns/${campaign._id}/apply`).send(pitch)

    // Talent apni application dekhta hai
    const detail = await a.agent.get(`/api/campaigns/${campaign._id}`)
    expect(detail.body.data.myApplication.status).toBe('pending')

    const apps = await owner.agent.get(`/api/campaigns/${campaign._id}/applications`)
    expect(apps.body.data.applications).toHaveLength(3)
    expect(apps.body.data.campaign.counts).toEqual({ applications: 3, accepted: 0, pending: 3 })
    const idOf = (personId: string) =>
      apps.body.data.applications.find((x: { person: { _id: string } }) => x.person._id === personId)._id

    // Doosra business kisi aur ki campaign nahi chhu sakta
    const other = await business()
    expect((await other.agent.get(`/api/campaigns/${campaign._id}/applications`)).status).toBe(404)

    const accepted = await owner.agent
      .patch(`/api/campaigns/${campaign._id}/applications/${idOf(String(a.person!._id))}`)
      .send({ action: 'accept' })
    expect(accepted.status).toBe(200)
    expect(accepted.body.data.application.status).toBe('accepted')
    const { HireRequest } = await import('../src/models/HireRequest')
    const hire = await HireRequest.findById(accepted.body.data.application.hire)
    expect(hire).toMatchObject({ status: 'accepted', title: 'Summer snack launch' })
    expect(String(hire!.talent)).toBe(String(a.user._id))

    // Talent ki taraf: hire request accepted, raabta khula
    const incoming = await a.agent.get('/api/me/hire-requests')
    expect(incoming.body.data.hires[0].contact.email).toBe(owner.user.email)

    await owner.agent.patch(`/api/campaigns/${campaign._id}/applications/${idOf(String(b.person!._id))}`).send({ action: 'reject' })
    const second = await owner.agent
      .patch(`/api/campaigns/${campaign._id}/applications/${idOf(String(c.person!._id))}`)
      .send({ action: 'accept' })
    // 2 slots bhar gaye -> band
    expect(second.body.data.campaign.status).toBe('closed')
    expect((await request(app).get('/api/campaigns')).body.data.campaigns.map((x: { _id: string }) => x._id)).not.toContain(campaign._id)
    const late = await talent()
    expect((await late.agent.post(`/api/campaigns/${campaign._id}/apply`).send(pitch)).body.error.code).toBe('CAMPAIGN_CLOSED')

    const mine = await b.agent.get('/api/campaigns/applications/mine')
    expect(mine.body.data.applications[0]).toMatchObject({ status: 'rejected', campaign: { title: 'Summer snack launch' } })

    const { Notification } = await import('../src/models/Notification')
    expect(await Notification.countDocuments({ recipient: owner.user._id, type: 'campaign.application' })).toBe(3)
    expect(await Notification.countDocuments({ recipient: a.user._id, type: 'campaign.accepted' })).toBe(1)
    expect(await Notification.countDocuments({ recipient: b.user._id, type: 'campaign.rejected' })).toBe(1)
  })

  it('lets talent withdraw and apply again, and the business close, reopen and delete', async () => {
    const owner = await business()
    const { body } = await owner.agent.post('/api/campaigns').send({ ...campaignBody, country: '' })
    const id = body.data.campaign._id
    const t = await talent()
    const applied = await t.agent.post(`/api/campaigns/${id}/apply`).send({ pitch: 'I would love to work on this campaign.' })
    const appId = applied.body.data.application._id
    expect((await t.agent.post(`/api/campaigns/applications/${appId}/withdraw`)).body.data.application.status).toBe('withdrawn')
    expect((await t.agent.post(`/api/campaigns/${id}/apply`).send({ pitch: 'Changed my mind, I am available after all.' })).status).toBe(200)

    expect((await owner.agent.patch(`/api/campaigns/${id}`).send({ status: 'draft' })).body.error.code).toBe('INVALID_STATE')
    expect((await owner.agent.patch(`/api/campaigns/${id}`).send({ status: 'closed', title: 'Summer launch' })).body.data.campaign).toMatchObject({ status: 'closed', title: 'Summer launch' })
    expect((await owner.agent.patch(`/api/campaigns/${id}`).send({ status: 'open' })).body.data.campaign.status).toBe('open')

    const mine = await owner.agent.get('/api/campaigns/mine')
    expect(mine.body.data.canPublish).toBe(true)
    expect(mine.body.data.campaigns[0].counts.pending).toBe(1)

    expect((await owner.agent.delete(`/api/campaigns/${id}`)).status).toBe(200)
    const { CampaignApplication } = await import('../src/models/CampaignApplication')
    expect(await CampaignApplication.countDocuments({ campaign: id })).toBe(0)
  })

  it('removes campaigns and applications with the account', async () => {
    const { Campaign } = await import('../src/models/Campaign')
    const { CampaignApplication } = await import('../src/models/CampaignApplication')
    const owner = await business()
    const { body } = await owner.agent.post('/api/campaigns').send(campaignBody)
    const t = await talent()
    await t.agent.post(`/api/campaigns/${body.data.campaign._id}/apply`).send({ pitch: 'I would love to work on this campaign.' })
    await owner.agent.delete('/api/auth/account').send({ confirm: `delete ${owner.user.name}` })
    expect(await Campaign.countDocuments({ owner: owner.user._id })).toBe(0)
    expect(await CampaignApplication.countDocuments({ business: owner.user._id })).toBe(0)
  })
})
