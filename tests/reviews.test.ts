import type { Express } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { createPerson, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('reviews')
})
afterAll(teardownDb)

// Mukammal muahide jin pe business ne review di (sirf woh fields jo reviews parhti hain)
async function completedWithReviews(personId: Types.ObjectId, ratings: number[]) {
  const { Agreement } = await import('../src/models/Agreement')
  await Agreement.collection.insertMany(
    ratings.map((rating, i) => ({
      hire: new Types.ObjectId(),
      person: personId,
      status: 'completed',
      completedAt: new Date(Date.now() - i * 60_000),
      reviews: {
        business: { rating, comment: `Review ${i + 1}`, createdAt: new Date(Date.now() - i * 60_000) },
      },
    })),
  )
}

describe('talent reviews', () => {
  it('shows the average and count on cards and the profile, and pages the reviews', async () => {
    const person = await createPerson({ name: 'Rated Person' })
    const plain = await createPerson({ name: 'No Reviews Person' })
    await completedWithReviews(person._id, [5, 4, 5, 3, 5, 4])

    const list = await request(app).get('/api/people?q=Person&limit=50')
    const byName = (name: string) => list.body.data.people.find((p: { name: string }) => p.name === name)
    expect(byName('Rated Person').rating).toEqual({ average: 4.3, count: 6 })
    expect(byName('No Reviews Person').rating).toBeNull()

    const profile = await request(app).get(`/api/people/${person.slug}`)
    expect(profile.body.data.person.rating).toEqual({ average: 4.3, count: 6 })
    expect((await request(app).get(`/api/people/${plain.slug}`)).body.data.person.rating).toBeNull()

    // Profile pe pehle 4, newest first
    const first = await request(app).get(`/api/people/${person.slug}/reviews`)
    expect(first.body.data.rating).toEqual({ average: 4.3, count: 6 })
    expect(first.body.data.reviews.map((r: { comment: string }) => r.comment)).toEqual([
      'Review 1',
      'Review 2',
      'Review 3',
      'Review 4',
    ])
    expect(first.body.meta).toEqual({ page: 1, limit: 4, total: 6 })

    const rest = await request(app).get(`/api/people/${person.slug}/reviews?page=2&limit=4`)
    expect(rest.body.data.reviews.map((r: { comment: string }) => r.comment)).toEqual(['Review 5', 'Review 6'])
  })
})
