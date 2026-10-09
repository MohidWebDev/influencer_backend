import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('shortlists')
})
afterAll(teardownDb)

describe('shortlists', () => {
  it('is only for business, agency and organization accounts', async () => {
    const { agent: talent } = await loginAs(app, 'talent')
    expect((await talent.get('/api/shortlists')).status).toBe(403)
    expect((await request(app).get('/api/shortlists')).status).toBe(401)
    const { agent: agency } = await loginAs(app, 'agency')
    expect((await agency.get('/api/shortlists')).status).toBe(200)
  })

  it('creates named lists, saves people with notes and shows membership', async () => {
    const { agent } = await loginAs(app, 'business')
    const sana = await createPerson({ headline: 'Food creator', totalFollowers: 120000 })
    const ali = await createPerson()

    const empty = await agent.post('/api/shortlists').send({ name: '  ' })
    expect(empty.status).toBe(400)

    const ramadan = await agent.post('/api/shortlists').send({ name: 'Ramadan campaign' })
    expect(ramadan.status).toBe(201)
    const id = ramadan.body.data.shortlist._id
    const twice = await agent.post('/api/shortlists').send({ name: 'ramadan CAMPAIGN' })
    expect(twice.status).toBe(409)
    expect(twice.body.error.code).toBe('SHORTLIST_EXISTS')

    const added = await agent.post(`/api/shortlists/${id}/items`).send({ personId: String(sana._id), note: 'Ask about Reels' })
    expect(added.status).toBe(201)
    expect(added.body.data.shortlist.items[0].note).toBe('Ask about Reels')
    expect(added.body.data.shortlist.items[0].person.name).toBe(sana.name)
    // Dobara daalna duplicate nahi banata
    const again = await agent.post(`/api/shortlists/${id}/items`).send({ personId: String(sana._id) })
    expect(again.status).toBe(200)
    expect(again.body.data.shortlist.items).toHaveLength(1)
    await agent.post(`/api/shortlists/${id}/items`).send({ personId: String(ali._id) })

    const noted = await agent.patch(`/api/shortlists/${id}/items/${sana._id}`).send({ note: 'Great engagement' })
    expect(noted.body.data.shortlist.items[0].note).toBe('Great engagement')

    const lists = await agent.get('/api/shortlists')
    expect(lists.body.data.shortlists[0].count).toBe(2)
    expect(lists.body.data.shortlists[0].preview).toHaveLength(2)

    const saved = await agent.get('/api/shortlists/saved')
    expect(saved.body.data.saved[String(sana._id)]).toEqual([id])

    const removed = await agent.delete(`/api/shortlists/${id}/items/${ali._id}`)
    expect(removed.body.data.shortlist.items).toHaveLength(1)
    expect((await agent.delete(`/api/shortlists/${id}/items/${ali._id}`)).status).toBe(404)

    const renamed = await agent.patch(`/api/shortlists/${id}`).send({ name: 'Eid campaign' })
    expect(renamed.body.data.shortlist.name).toBe('Eid campaign')
    expect((await agent.delete(`/api/shortlists/${id}`)).status).toBe(200)
    expect((await agent.get(`/api/shortlists/${id}`)).status).toBe(404)
  })

  it('keeps lists private to their owner', async () => {
    const { agent: owner } = await loginAs(app, 'business')
    const { agent: other } = await loginAs(app, 'business')
    const id = (await owner.post('/api/shortlists').send({ name: 'Mine' })).body.data.shortlist._id
    expect((await other.get(`/api/shortlists/${id}`)).status).toBe(404)
    expect((await other.delete(`/api/shortlists/${id}`)).status).toBe(404)
  })

  it('shows hidden profiles as unavailable and the business’s hiring status', async () => {
    const { BusinessProfile } = await import('../src/models/BusinessProfile')
    const { Person } = await import('../src/models/Person')
    const { agent, user } = await loginAs(app, 'business')
    await BusinessProfile.create({
      owner: user._id,
      companyName: 'Acme Foods',
      websiteUrl: 'https://acme.example.com',
      country: 'PK',
      status: 'approved',
    })
    const talent = await loginAs(app, 'talent')
    const verified = await createPerson({ claimedBy: talent.user._id, verified: true })
    const hidden = await createPerson()
    const id = (await agent.post('/api/shortlists').send({ name: 'Spring' })).body.data.shortlist._id
    await agent.post(`/api/shortlists/${id}/items`).send({ personId: String(verified._id) })
    await agent.post(`/api/shortlists/${id}/items`).send({ personId: String(hidden._id) })
    await Person.updateOne({ _id: hidden._id }, { $set: { visibility: 'hidden' } })

    await agent.post('/api/business/hires').send({
      personId: String(verified._id),
      title: 'Spring campaign',
      message: 'We would love you to front our spring snack campaign on Instagram.',
    })

    const list = (await agent.get(`/api/shortlists/${id}`)).body.data.shortlist
    const hired = list.items.find((i: { personId: string }) => i.personId === String(verified._id))
    const gone = list.items.find((i: { personId: string }) => i.personId === String(hidden._id))
    expect(hired.hiring.hireStatus).toBe('pending')
    expect(hired.person.verified).toBe(true)
    expect(gone.available).toBe(false)
    expect(gone.person.slug).toBeUndefined()

    // Chhupi profile list mein nayi nahi daali ja sakti
    const id2 = (await agent.post('/api/shortlists').send({ name: 'Other' })).body.data.shortlist._id
    expect((await agent.post(`/api/shortlists/${id2}/items`).send({ personId: String(hidden._id) })).status).toBe(404)
  })

  it('deletes the lists with the account', async () => {
    const { Shortlist } = await import('../src/models/Shortlist')
    const { agent, user } = await loginAs(app, 'organization')
    await agent.post('/api/shortlists').send({ name: 'Speakers' })
    await agent.delete('/api/auth/account').send({ confirm: `delete ${user.name}` })
    expect(await Shortlist.countDocuments({ owner: user._id })).toBe(0)
  })
})
