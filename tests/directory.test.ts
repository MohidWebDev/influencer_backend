import type { Express } from 'express'
import request from 'supertest'
import { setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('directory')
})
afterAll(teardownDb)

const list = async (kind: 'businesses' | 'managers', query = '') => {
  const res = await request(app).get(`/api/directory/${kind}?${query}`)
  expect(res.status).toBe(200)
  return res.body
}

describe('public business and manager directory', () => {
  it('starts empty', async () => {
    expect((await list('businesses')).data.businesses).toEqual([])
    expect((await list('managers')).data.managers).toEqual([])
  })

  it('shows a business as soon as it signs up, without private details', async () => {
    await request(app).post('/api/auth/register').send({
      role: 'business',
      organizationType: 'brand',
      companyName: 'Acme Foods',
      country: 'pk',
      industry: 'Food & beverage',
      companySize: '11-50',
      email: 'acme@test.com',
      password: 'password123',
    })
    const body = await list('businesses')
    expect(body.meta.total).toBe(1)
    const [acme] = body.data.businesses
    expect(acme).toMatchObject({ name: 'Acme Foods', organizationType: 'brand', country: 'PK', industry: 'Food & beverage', companySize: '11-50', verified: false, inReview: false })
    expect(JSON.stringify(body)).not.toContain('acme@test.com')
  })

  it('shows a manager as soon as they sign up', async () => {
    await request(app).post('/api/auth/register').send({ role: 'representative', name: 'Sara Agent', agencyName: 'Star Talent', country: 'AE', email: 'sara@test.com', password: 'password123' })
    const body = await list('managers')
    expect(body.data.managers.map((m: { name: string }) => m.name)).toEqual(['Sara Agent'])
    expect(body.data.managers[0]).toMatchObject({ agencyName: 'Star Talent', country: 'AE', talents: 0 })
    expect(JSON.stringify(body)).not.toContain('sara@test.com')
  })

  it('lists verified first, hides rejected and suspended accounts, never shows phone or registration number', async () => {
    const { User } = await import('../src/models/User')
    const { BusinessProfile } = await import('../src/models/BusinessProfile')
    const make = async (name: string) => {
      await request(app).post('/api/auth/register').send({ role: 'business', organizationType: 'company', companyName: name, country: 'PK', email: `${name.replace(/\s/g, '')}@test.com`, password: 'password123' })
      return User.findOne({ name })
    }
    const verified = await make('Verified Co')
    await BusinessProfile.create({ owner: verified!._id, companyName: 'Verified Co', websiteUrl: 'https://verified.example.com', country: 'PK', city: 'Lahore', contactPhone: '+92300000000', registrationNumber: 'REG-123', proofLinks: ['https://proof.example.com'], status: 'approved' })
    const rejected = await make('Rejected Co')
    await BusinessProfile.create({ owner: rejected!._id, companyName: 'Rejected Co', websiteUrl: 'https://r.example.com', country: 'PK', status: 'rejected' })
    const suspended = await make('Suspended Co')
    await User.updateOne({ _id: suspended!._id }, { status: 'suspended' })

    const body = await list('businesses')
    const names = body.data.businesses.map((b: { name: string }) => b.name)
    expect(names[0]).toBe('Verified Co')
    expect(names).not.toContain('Rejected Co')
    expect(names).not.toContain('Suspended Co')
    expect(body.data.businesses[0]).toMatchObject({ verified: true, country: 'PK', city: 'Lahore', websiteUrl: 'https://verified.example.com' })
    const raw = JSON.stringify(body)
    for (const secret of ['+92300000000', 'REG-123', 'proof.example.com', 'owner']) expect(raw).not.toContain(secret)
  })

  it('searches by name and pages the results', async () => {
    expect((await list('businesses', 'q=acme')).data.businesses.map((b: { name: string }) => b.name)).toEqual(['Acme Foods'])
    const page = await list('businesses', 'limit=1&page=2')
    expect(page.data.businesses).toHaveLength(1)
    expect(page.meta).toMatchObject({ page: 2, limit: 1, total: 2 })
  })
})
