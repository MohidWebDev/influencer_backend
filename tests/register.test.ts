import type { Express } from 'express'
import request from 'supertest'
import { setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('register')
})
afterAll(teardownDb)

const register = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/register').send({ password: 'password123', ...body })

describe('register', () => {
  it('signs up a business / organization with its type and details instead of a personal name', async () => {
    const res = await register({
      role: 'business',
      organizationType: 'ngo',
      companyName: 'Acme Foundation',
      country: 'pk',
      websiteUrl: 'https://acme.example.com',
      industry: 'Education',
      companySize: '11-50',
      description: 'We run schools.',
      email: 'owner@acme.example.com',
    })
    expect(res.status).toBe(201)
    expect(res.body.data.user.role).toBe('business')
    expect(res.body.data.user.name).toBe('Acme Foundation')
    expect(res.body.data.user.company).toEqual({
      organizationType: 'ngo',
      companyName: 'Acme Foundation',
      country: 'PK',
      websiteUrl: 'https://acme.example.com',
      industry: 'Education',
      companySize: '11-50',
      description: 'We run schools.',
    })
    expect(res.body.data.user.manager).toBeUndefined()
  })

  it('needs the organization type, name and country for a business', async () => {
    const res = await register({ role: 'business', name: 'Ali', email: 'b2@test.com' })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.error.fields)).toEqual(
      expect.arrayContaining(['organizationType', 'companyName', 'country']),
    )

    const bad = await register({
      role: 'business',
      organizationType: 'club',
      companyName: 'Acme',
      country: 'PK',
      companySize: 'huge',
      websiteUrl: 'not a url',
      email: 'b3@test.com',
    })
    expect(Object.keys(bad.body.error.fields)).toEqual(
      expect.arrayContaining(['organizationType', 'companySize', 'websiteUrl']),
    )
  })

  it('signs up a manager with name and country, agency and website optional', async () => {
    const missing = await register({ role: 'representative', name: 'Sara', email: 'm1@test.com' })
    expect(missing.status).toBe(400)
    expect(missing.body.error.fields.country).toBeTruthy()

    const ok = await register({ role: 'representative', name: 'Sara Agent', country: 'ae', email: 'm2@test.com' })
    expect(ok.status).toBe(201)
    expect(ok.body.data.user.manager).toEqual({ country: 'AE' })
    expect(ok.body.data.user.company).toBeUndefined()
  })

  it('needs only a name for talent and rejects removed account types', async () => {
    const talent = await register({ role: 'talent', companyName: 'Acme', email: 't1@test.com' })
    expect(talent.status).toBe(400)
    expect(talent.body.error.fields.name).toBeTruthy()

    const ok = await register({ role: 'talent', name: 'Sana Khan', email: 't2@test.com' })
    expect(ok.status).toBe(201)
    expect(ok.body.data.user.company).toBeUndefined()

    for (const role of ['agency', 'organization', 'admin']) {
      const res = await register({ role, name: 'X Y', email: `${role}@test.com` })
      expect(res.status).toBe(400)
    }
  })

  it('moves old agency and organization accounts into business on connect', async () => {
    const { User, migrateLegacyBusinessRoles } = await import('../src/models/User')
    await User.collection.insertMany([
      { name: 'Old Agency', email: 'oa@test.com', password: 'x', role: 'agency' },
      { name: 'Old Org', email: 'oo@test.com', password: 'x', role: 'organization', company: { companyName: 'Org Ltd' } },
    ])
    await migrateLegacyBusinessRoles()
    const agency = await User.findOne({ email: 'oa@test.com' }).lean()
    const org = await User.findOne({ email: 'oo@test.com' }).lean()
    expect(agency).toMatchObject({ role: 'business', company: { companyName: 'Old Agency', organizationType: 'marketing_agency' } })
    expect(org).toMatchObject({ role: 'business', company: { companyName: 'Org Ltd', organizationType: 'other' } })
  })
})
