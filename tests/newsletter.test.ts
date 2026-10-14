import type { Express } from 'express'
import request from 'supertest'
import { loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  // Rate limit apne test (security.test.ts) mein; yahan band
  process.env.RATE_LIMIT = 'off'
  app = await setupApp('newsletter')
})
afterAll(teardownDb)

describe('newsletter', () => {
  it('subscribes anyone, the same way twice, and rejects bad emails', async () => {
    const { NewsletterSubscriber } = await import('../src/models/NewsletterSubscriber')
    const first = await request(app).post('/api/newsletter/subscribe').send({ email: ' Ali@Example.com ', language: 'ur' })
    expect(first.status).toBe(200)
    expect(first.body.data).toEqual({ subscribed: true })
    // Dobara: wahi jawab, koi duplicate nahi (koi jaan na sake ke email pehle se hai)
    const again = await request(app).post('/api/newsletter/subscribe').send({ email: 'ali@example.com' })
    expect(again.body.data).toEqual({ subscribed: true })
    expect(await NewsletterSubscriber.countDocuments({ email: 'ali@example.com' })).toBe(1)

    const bad = await request(app).post('/api/newsletter/subscribe').send({ email: 'not-an-email' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields.email).toBeTruthy()
  })

  it('unsubscribes with the secret token and can subscribe again', async () => {
    const { NewsletterSubscriber } = await import('../src/models/NewsletterSubscriber')
    await request(app).post('/api/newsletter/subscribe').send({ email: 'sara@example.com' })
    const saved = await NewsletterSubscriber.findOne({ email: 'sara@example.com' }).select('+unsubscribeToken')
    expect(saved!.unsubscribeToken).toMatch(/^[a-f0-9]{48}$/)

    expect((await request(app).post('/api/newsletter/unsubscribe').send({ token: 'f'.repeat(48) })).status).toBe(404)
    const out = await request(app).post('/api/newsletter/unsubscribe').send({ token: saved!.unsubscribeToken })
    expect(out.body.data).toEqual({ unsubscribed: true, email: 'sara@example.com' })
    expect((await NewsletterSubscriber.findById(saved!._id))!.status).toBe('unsubscribed')

    await request(app).post('/api/newsletter/subscribe').send({ email: 'sara@example.com' })
    expect((await NewsletterSubscriber.findById(saved!._id))!.status).toBe('subscribed')
  })

  it('lets only admins list, export and delete subscribers', async () => {
    // Form aisa email nahi leta, phir bhi CSV mein Excel formula na bane
    const { NewsletterSubscriber } = await import('../src/models/NewsletterSubscriber')
    await NewsletterSubscriber.create({ email: '=cmd@example.com' })
    const { agent: talent } = await loginAs(app, 'talent')
    expect((await talent.get('/api/admin/newsletter')).status).toBe(403)

    const { agent: admin } = await loginAs(app, 'admin')
    const list = await admin.get('/api/admin/newsletter?q=example')
    expect(list.status).toBe(200)
    expect(list.body.data.subscribed).toBeGreaterThanOrEqual(3)
    expect(list.body.data.subscribers[0].unsubscribeToken).toBeUndefined()

    const csv = await admin.get('/api/admin/newsletter/export')
    expect(csv.headers['content-type']).toMatch(/text\/csv/)
    expect(csv.text.split('\n')[0]).toBe('email,language,subscribed_at')
    expect(csv.text).toContain('ali@example.com,ur,')
    // Excel formula wala email: aage ' laga kar
    expect(csv.text).toContain("'=cmd@example.com")

    const id = list.body.data.subscribers.find((s: { email: string }) => s.email === 'ali@example.com')._id
    expect((await admin.delete(`/api/admin/newsletter/${id}`)).status).toBe(200)
    expect((await admin.delete(`/api/admin/newsletter/${id}`)).status).toBe(404)
  })
})
