import type { Express } from 'express'
import request from 'supertest'
import { loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('security')
})
afterAll(async () => {
  process.env.RATE_LIMIT = 'off'
  await teardownDb()
})

describe('security', () => {
  it('sends security headers and hides Express', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['content-security-policy']).toBeDefined()
  })

  it('allows CORS only for the frontend', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:3000')
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(ok.headers['access-control-allow-credentials']).toBe('true')
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example.com')
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('drops MongoDB operators from the body', async () => {
    await loginAs(app, 'talent')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $ne: 'x' } })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('accepts only http(s) links', async () => {
    const bad = await request(app).post('/api/auth/register').send({
      role: 'business',
      organizationType: 'brand',
      companyName: 'Evil Co',
      country: 'PK',
      websiteUrl: 'javascript:alert(document.cookie)',
      email: 'evil@test.com',
      password: 'password123',
    })
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields.websiteUrl).toBeTruthy()
  })

  it('locks login for an email after 10 failed attempts, without blocking other accounts', async () => {
    process.env.RATE_LIMIT = 'on'
    const { user } = await loginAs(app, 'talent')
    const attempt = (email: string, password = 'wrong-password') =>
      request(app).post('/api/auth/login').send({ email, password })
    for (let i = 0; i < 10; i++) expect((await attempt(user.email)).status).toBe(401)
    const blocked = await attempt(user.email, 'password123')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS')
    expect(blocked.headers['ratelimit-policy']).toBeDefined()
    // Doosra account usi IP se chal raha hai
    const { user: other } = await loginAs(app, 'talent')
    expect((await attempt(other.email, 'password123')).status).toBe(200)
    process.env.RATE_LIMIT = 'off'
  })

  it('does not count successful logins', async () => {
    process.env.RATE_LIMIT = 'on'
    const { user } = await loginAs(app, 'business')
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' })
      expect(res.status).toBe(200)
    }
    process.env.RATE_LIMIT = 'off'
  })
})
