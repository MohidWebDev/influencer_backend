import type { Express } from 'express'
import request from 'supertest'
import { loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('auth_me')
})
afterAll(teardownDb)

// Cookie header se sirf ek cookie hatao (jaise browser mein access token expire ho gaya)
function cookiesOf(res: request.Response) {
  return ([] as string[]).concat(res.headers['set-cookie'] ?? [])
}

describe('GET /api/auth/me', () => {
  it('answers 200 with user null for a visitor without cookies', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.data.user).toBeNull()
    expect(cookiesOf(res)).toHaveLength(0)
  })

  it('returns the user while the access token is valid', async () => {
    const { agent, user } = await loginAs(app, 'talent')
    const res = await agent.get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe(user.email)
  })

  it('renews the tokens itself when only the refresh cookie is left', async () => {
    const { user } = await loginAs(app, 'talent')
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' })
    const refreshCookie = cookiesOf(login).find((c) => c.startsWith('refreshToken='))!.split(';')[0]

    const res = await request(app).get('/api/auth/me').set('Cookie', refreshCookie)
    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe(user.email)
    expect(cookiesOf(res).some((c) => c.startsWith('accessToken=') && !c.startsWith('accessToken=;'))).toBe(true)
  })

  it('clears bad cookies and answers user null instead of 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'accessToken=broken; refreshToken=broken')
    expect(res.status).toBe(200)
    expect(res.body.data.user).toBeNull()
    expect(cookiesOf(res).some((c) => c.startsWith('accessToken=;'))).toBe(true)
  })

  it('still protects other routes with 401', async () => {
    expect((await request(app).get('/api/notifications/unread-count')).status).toBe(401)
  })
})
