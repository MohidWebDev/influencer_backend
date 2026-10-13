import type { Express } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('directory_detail')
})
afterAll(teardownDb)

describe('business and manager detail pages', () => {
  it('shows a business with its rating, reviews from talents and open campaigns', async () => {
    const { BusinessProfile } = await import('../src/models/BusinessProfile')
    const { Agreement } = await import('../src/models/Agreement')
    const { Campaign } = await import('../src/models/Campaign')
    const { user } = await loginAs(app, 'business')
    await BusinessProfile.create({
      owner: user._id,
      companyName: 'Glow Co',
      organizationType: 'brand',
      websiteUrl: 'https://glow.example.com',
      country: 'PK',
      contactPhone: '+92300000000',
      registrationNumber: 'REG-9',
      status: 'approved',
    })
    const person = await createPerson({ name: 'Reviewer Talent' })
    await Agreement.collection.insertMany(
      [5, 4, 5, 3, 5].map((rating, i) => ({
        hire: new Types.ObjectId(),
        business: user._id,
        person: person._id,
        status: 'completed',
        reviews: { talent: { rating, comment: `Talent review ${i + 1}`, createdAt: new Date(Date.now() - i * 1000) } },
      })),
    )
    await Campaign.create({ owner: user._id, title: 'Open call', brief: 'x'.repeat(40), category: 'brand_campaign', status: 'open' })

    const list = await request(app).get('/api/directory/businesses')
    const card = list.body.data.businesses.find((b: { _id: string }) => b._id === String(user._id))
    expect(card.rating).toEqual({ average: 4.4, count: 5 })

    const detail = await request(app).get(`/api/directory/businesses/${user._id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.business).toMatchObject({ name: 'Glow Co', verified: true, completedWork: 5 })
    expect(detail.body.data.campaigns.map((c: { title: string }) => c.title)).toEqual(['Open call'])
    expect(JSON.stringify(detail.body)).not.toMatch(/REG-9|\+92300000000/)

    const reviews = await request(app).get(`/api/directory/businesses/${user._id}/reviews`)
    expect(reviews.body.data.reviews).toHaveLength(4)
    expect(reviews.body.data.reviews[0]).toMatchObject({ comment: 'Talent review 1', reviewer: 'Reviewer Talent' })
    expect(reviews.body.meta.total).toBe(5)

    expect((await request(app).get(`/api/directory/businesses/${new Types.ObjectId()}`)).status).toBe(404)
    expect((await request(app).get('/api/directory/businesses/not-an-id')).status).toBe(404)
  })

  it('lets a talent review their manager once and shows it on the manager page', async () => {
    const { ManagerProfile } = await import('../src/models/ManagerProfile')
    const { Representation } = await import('../src/models/Representation')
    const manager = await loginAs(app, 'representative')
    await ManagerProfile.create({
      owner: manager.user._id,
      agencyName: 'Star Talent',
      country: 'PK',
      socialAccounts: [{ platform: 'linkedin', url: 'https://linkedin.com/in/star' }],
      status: 'approved',
    })
    const talent = await loginAs(app, 'talent')
    const person = await createPerson({ name: 'Managed Star', claimedBy: talent.user._id })
    const rep = await Representation.create({
      manager: manager.user._id,
      talent: talent.user._id,
      person: person._id,
      status: 'active',
      initiatedBy: 'talent',
    })

    const bad = await talent.agent.post(`/api/me/manager/${rep._id}/review`).send({ rating: 9 })
    expect(bad.status).toBe(400)
    const ok = await talent.agent.post(`/api/me/manager/${rep._id}/review`).send({ rating: 5, comment: 'Great manager' })
    expect(ok.status).toBe(200)
    expect((await talent.agent.post(`/api/me/manager/${rep._id}/review`).send({ rating: 4 })).body.error.code).toBe('ALREADY_REVIEWED')
    // Kisi aur ka rishta review nahi ho sakta
    const stranger = await loginAs(app, 'talent')
    expect((await stranger.agent.post(`/api/me/manager/${rep._id}/review`).send({ rating: 1 })).status).toBe(404)

    const list = await request(app).get('/api/directory/managers')
    const card = list.body.data.managers.find((m: { _id: string }) => m._id === String(manager.user._id))
    expect(card).toMatchObject({ talents: 1, rating: { average: 5, count: 1 } })

    const detail = await request(app).get(`/api/directory/managers/${manager.user._id}`)
    expect(detail.body.data.manager).toMatchObject({
      agencyName: 'Star Talent',
      socialAccounts: [{ platform: 'linkedin', url: 'https://linkedin.com/in/star' }],
    })
    expect(detail.body.data.talents.map((p: { name: string }) => p.name)).toEqual(['Managed Star'])

    const reviews = await request(app).get(`/api/directory/managers/${manager.user._id}/reviews`)
    expect(reviews.body.data.reviews[0]).toMatchObject({ rating: 5, comment: 'Great manager', reviewer: 'Managed Star' })

    const { Notification } = await import('../src/models/Notification')
    expect(await Notification.countDocuments({ recipient: manager.user._id, type: 'manager.reviewed' })).toBe(1)
  })
})
