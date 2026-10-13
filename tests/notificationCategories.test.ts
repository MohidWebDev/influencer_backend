import type { Express } from 'express'
import { loginAs, setupApp, teardownDb } from './helpers'
import { NOTIFICATION_CATEGORIES, categoryOf } from '../src/constants/notifications'
import { NOTIFICATION_TYPES } from '../src/models/Notification'

let app: Express

beforeAll(async () => {
  app = await setupApp('notification_categories')
})
afterAll(teardownDb)

describe('notification categories', () => {
  it('puts every notification type in exactly one category', () => {
    const all = Object.values(NOTIFICATION_CATEGORIES).flat() as string[]
    expect(new Set(all).size).toBe(all.length)
    for (const type of NOTIFICATION_TYPES) expect(categoryOf(type)).toBeDefined()
  })

  it('filters by category, counts each tab and marks one category read', async () => {
    const { Notification } = await import('../src/models/Notification')
    const { agent, user } = await loginAs(app, 'business')
    const link = '/dashboard'
    await Notification.create([
      { recipient: user._id, type: 'hire.accepted', data: {}, link },
      { recipient: user._id, type: 'hire.declined', data: {}, link, readAt: new Date() },
      { recipient: user._id, type: 'campaign.application', data: {}, link },
      { recipient: user._id, type: 'business.approved', data: {}, link },
    ])

    const all = await agent.get('/api/notifications')
    expect(all.body.data.unread).toBe(3)
    expect(all.body.data.categories).toEqual({
      hiring: { total: 2, unread: 1 },
      campaigns: { total: 1, unread: 1 },
      verification: { total: 1, unread: 1 },
    })

    const hiring = await agent.get('/api/notifications?category=hiring')
    expect(hiring.body.meta.total).toBe(2)
    expect((await agent.get('/api/notifications?category=hiring&unread=true')).body.meta.total).toBe(1)
    expect((await agent.get('/api/notifications?category=nope')).status).toBe(400)

    await agent.post('/api/notifications/read-all?category=hiring')
    const after = await agent.get('/api/notifications')
    expect(after.body.data.unread).toBe(2)
    expect(after.body.data.categories.hiring.unread).toBe(0)
  })
})
