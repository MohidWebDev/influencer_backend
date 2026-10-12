import type { Express } from 'express'
import request from 'supertest'
import { setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('register')
})
afterAll(teardownDb)

describe('register', () => {
  it('signs up a business with its company details instead of a personal name', async () => {
    const res = await request(app).post('/api/auth/register').send({
      role: 'business',
      companyName: 'Acme Foods',
      industry: 'Food & beverage',
      companySize: '11-50',
      description: 'We make snacks.',
      email: 'owner@acme.example.com',
      password: 'password123',
    })
    expect(res.status).toBe(201)
    expect(res.body.data.user.name).toBe('Acme Foods')
    expect(res.body.data.user.company).toEqual({
      companyName: 'Acme Foods',
      industry: 'Food & beverage',
      companySize: '11-50',
      description: 'We make snacks.',
    })
  })

  it('needs a company name for business and a name for everyone else', async () => {
    const business = await request(app)
      .post('/api/auth/register')
      .send({ role: 'business', name: 'Ali', email: 'b2@test.com', password: 'password123' })
    expect(business.status).toBe(400)
    expect(business.body.error.fields.companyName).toBeTruthy()

    const badSize = await request(app)
      .post('/api/auth/register')
      .send({ role: 'business', companyName: 'Acme', companySize: 'huge', email: 'b3@test.com', password: 'password123' })
    expect(badSize.body.error.fields.companySize).toBeTruthy()

    const talent = await request(app)
      .post('/api/auth/register')
      .send({ role: 'talent', companyName: 'Acme', email: 't1@test.com', password: 'password123' })
    expect(talent.status).toBe(400)
    expect(talent.body.error.fields.name).toBeTruthy()

    const ok = await request(app)
      .post('/api/auth/register')
      .send({ role: 'talent', name: 'Sana Khan', email: 't2@test.com', password: 'password123' })
    expect(ok.status).toBe(201)
    expect(ok.body.data.user.company).toBeUndefined()
  })
})
