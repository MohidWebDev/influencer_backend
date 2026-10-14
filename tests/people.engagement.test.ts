import type { Express } from 'express'
import request from 'supertest'
import { averageEngagement } from '../src/utils/engagement'
import { createPerson, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('people_engagement')
})
afterAll(teardownDb)

describe('engagement on people cards', () => {
  it('weights each account by its followers', () => {
    expect(averageEngagement([{ followers: 900000, engagementRate: 7.2 }, { followers: 100000, engagementRate: 2 }])).toBe(6.7)
    expect(averageEngagement([{ engagementRate: 3 }, { engagementRate: 5 }])).toBe(4)
    expect(averageEngagement([{ followers: 1000 }])).toBeNull()
    expect(averageEngagement([])).toBeNull()
  })

  it('returns engagementRate on each list item without the social accounts', async () => {
    await createPerson({
      name: 'Engaged Creator',
      totalFollowers: 1000000,
      socialAccounts: [
        { platform: 'tiktok', url: 'https://tiktok.com/@a', followers: 900000, engagementRate: 7.2 },
        { platform: 'x', url: 'https://x.com/a', followers: 100000, engagementRate: 2 },
      ],
    })
    await createPerson({ name: 'Quiet Person' })

    const res = await request(app).get('/api/people?sort=followers')
    const engaged = res.body.data.people.find((p: { name: string }) => p.name === 'Engaged Creator')
    const quiet = res.body.data.people.find((p: { name: string }) => p.name === 'Quiet Person')
    expect(engaged.engagementRate).toBe(6.7)
    expect(engaged.socialAccounts).toBeUndefined()
    expect(quiet.engagementRate).toBeNull()
  })
})
