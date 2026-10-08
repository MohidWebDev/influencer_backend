import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('services')
})
afterAll(teardownDb)

const keynote = {
  title: 'Keynote talk',
  category: 'keynote',
  description: 'A 45 minute talk on leadership.',
  pricing: { type: 'fixed', currency: 'PKR', unit: 'event', amount: 250000 },
  deliveryDays: 14,
}

async function talentWithProfile() {
  const talent = await loginAs(app, 'talent')
  const person = await createPerson({ claimedBy: talent.user._id, verified: true, status: 'contactable' })
  return { ...talent, person }
}

describe('services and availability', () => {
  it('needs a claimed profile and the talent role', async () => {
    const { agent } = await loginAs(app, 'talent')
    const none = await agent.get('/api/me/services')
    expect(none.status).toBe(404)
    expect(none.body.error.code).toBe('NO_PROFILE')
    const { agent: business } = await loginAs(app, 'business')
    expect((await business.get('/api/me/services')).status).toBe(403)
    expect((await request(app).get('/api/me/services')).status).toBe(401)
  })

  it('adds, edits, hides and deletes services with validated pricing', async () => {
    const { agent } = await talentWithProfile()

    const bad = await agent.post('/api/me/services').send({ ...keynote, pricing: { type: 'range', currency: 'PKR', unit: 'event', min: 500, max: 100 } })
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields['pricing.max']).toBeTruthy()

    const created = await agent.post('/api/me/services').send(keynote)
    expect(created.status).toBe(201)
    const id = created.body.data.service._id
    expect(created.body.data.services).toHaveLength(1)

    const quote = await agent.patch(`/api/me/services/${id}`).send({ pricing: { type: 'quote' }, deliveryDays: null })
    expect(quote.status).toBe(200)
    expect(quote.body.data.service.pricing.type).toBe('quote')
    expect(quote.body.data.service.pricing.amount).toBeUndefined()
    expect(quote.body.data.service.deliveryDays).toBeUndefined()

    const off = await agent.patch(`/api/me/services/${id}`).send({ isActive: false })
    expect(off.body.data.service.isActive).toBe(false)

    const removed = await agent.delete(`/api/me/services/${id}`)
    expect(removed.body.data.services).toHaveLength(0)
    expect((await agent.delete(`/api/me/services/${id}`)).status).toBe(404)
  })

  it('becomes hireable when open with an active service, shows only active services publicly, and filters by openTo', async () => {
    const { agent, person } = await talentWithProfile()
    await agent.post('/api/me/services').send(keynote)
    const hidden = await agent.post('/api/me/services').send({ ...keynote, title: 'Private workshop', category: 'workshop', isActive: false })
    expect(hidden.body.data.person.status).toBe('contactable')

    const open = await agent.put('/api/me/availability').send({
      isOpen: true,
      openTo: ['speaking', 'events', 'speaking'],
      responseTime: '24h',
      note: 'Booking for spring.',
    })
    expect(open.status).toBe(200)
    expect(open.body.data.availability.openTo).toEqual(['speaking', 'events'])
    expect(open.body.data.person.status).toBe('hireable')

    const profile = await request(app).get(`/api/people/${person.slug}`)
    expect(profile.body.data.person.services.map((s: { title: string }) => s.title)).toEqual(['Keynote talk'])
    expect(profile.body.data.person.availability.isOpen).toBe(true)

    const speakers = await request(app).get('/api/people?openTo=speaking&limit=50')
    expect(speakers.body.data.people.map((p: { slug: string }) => p.slug)).toContain(person.slug)
    const podcasts = await request(app).get('/api/people?openTo=podcasts&limit=50')
    expect(podcasts.body.data.people.map((p: { slug: string }) => p.slug)).not.toContain(person.slug)

    const closed = await agent.put('/api/me/availability').send({ isOpen: false, openTo: [] })
    expect(closed.body.data.person.status).toBe('contactable')
  })

  it('caps the number of services', async () => {
    const { agent } = await talentWithProfile()
    for (let i = 0; i < 12; i++) {
      expect((await agent.post('/api/me/services').send({ ...keynote, title: `Service ${i}` })).status).toBe(201)
    }
    const more = await agent.post('/api/me/services').send(keynote)
    expect(more.status).toBe(409)
    expect(more.body.error.code).toBe('TOO_MANY_SERVICES')
  })

  it('clears services when the owner deletes their account', async () => {
    const { agent, user, person } = await talentWithProfile()
    await agent.post('/api/me/services').send(keynote)
    await agent.put('/api/me/availability').send({ isOpen: true, openTo: ['speaking'] })
    await agent.delete('/api/auth/account').send({ confirm: `delete ${user.name}` })
    const { Person } = await import('../src/models/Person')
    const after = await Person.findById(person._id)
    expect(after!.services).toHaveLength(0)
    expect(after!.availability).toBeUndefined()
    expect(after!.status).toBe('public')
  })
})
