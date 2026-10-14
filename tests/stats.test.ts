import type { Express } from 'express'
import request from 'supertest'
import { createPerson, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('stats')
})
afterAll(teardownDb)

describe('home stats', () => {
  it('counts public profiles, new ones, countries, verified and categories', async () => {
    const { Profession } = await import('../src/models/taxonomy')
    const { Person } = await import('../src/models/Person')
    const [journalist, youtuber, doctor] = await Profession.create([
      { name: 'Journalist', slug: 'journalist' },
      { name: 'YouTuber', slug: 'youtuber' },
      { name: 'Doctor', slug: 'doctor' },
    ])
    await createPerson({ country: 'PK', verified: true, professions: [journalist._id] })
    await createPerson({ country: 'PK', professions: [youtuber._id, journalist._id] })
    await createPerson({ country: 'AE', professions: [doctor._id] })
    const old = await createPerson({ country: 'GB' })
    await Person.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date('2020-01-01') } })
    // Chhupa profile kahin nahi ginta
    await createPerson({ country: 'US', verified: true, professions: [journalist._id], visibility: 'hidden' })

    const res = await request(app).get('/api/stats/home')
    expect(res.status).toBe(200)
    expect(res.headers['cdn-cache-control']).toMatch(/max-age=300/)
    const data = res.body.data
    expect(data).toMatchObject({ profiles: 4, newThisWeek: 3, countries: 3, verified: 1 })
    const count = (key: string) => data.categories.find((c: { key: string }) => c.key === key).count
    expect(count('journalists')).toBe(2)
    expect(count('creators')).toBe(1)
    expect(count('experts')).toBe(1)
    expect(count('speakers')).toBe(0)
    expect(data.categories.find((c: { key: string }) => c.key === 'creators').slugs).toContain('youtuber')
  })
})
