import type { Express } from 'express'
import request from 'supertest'
import { createPerson, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('people_match')
  const { Industry, Profession, Topic } = await import('../src/models/taxonomy')
  const [sports, music] = await Industry.insertMany([
    { name: 'Sports', slug: 'sports' },
    { name: 'Music', slug: 'music' },
  ])
  const [cricketer, singer] = await Profession.insertMany([
    { name: 'Cricketer', slug: 'cricketer' },
    { name: 'Singer', slug: 'singer' },
  ])
  const [cricket] = await Topic.insertMany([{ name: 'Cricket', slug: 'cricket' }])
  await createPerson({ slug: 'pk-cricketer', industries: [sports._id], professions: [cricketer._id], topics: [cricket._id], country: 'PK' })
  await createPerson({ slug: 'in-cricketer', industries: [sports._id], professions: [cricketer._id], country: 'IN' })
  await createPerson({ slug: 'pk-singer', industries: [music._id], professions: [singer._id], country: 'PK' })
  await createPerson({ slug: 'singing-cricketer', industries: [sports._id, music._id], professions: [cricketer._id, singer._id], country: 'AE' })
})
afterAll(teardownDb)

const slugs = async (query: string) => {
  const res = await request(app).get(`/api/people?limit=50&sort=name&${query}`)
  expect(res.status).toBe(200)
  return res.body.data.people.map((p: { slug: string }) => p.slug).sort()
}

describe('browse multi-select matching', () => {
  it('match=all needs every selected item', async () => {
    expect(await slugs('industry=sports,music&match=all')).toEqual(['singing-cricketer'])
    expect(await slugs('industry=sports&profession=cricketer&topic=cricket&match=all')).toEqual(['pk-cricketer'])
    // Kai mulk: in mein se koi bhi
    expect(await slugs('profession=cricketer&country=PK,IN&match=all')).toEqual(['in-cricketer', 'pk-cricketer'])
    // Ghalat slug ho to "all" pura nahi ho sakta
    expect(await slugs('industry=sports,unknown&match=all')).toEqual([])
  })

  it('match=any accepts any selected item', async () => {
    expect(await slugs('profession=singer&topic=cricket&match=any')).toEqual(['pk-cricketer', 'pk-singer', 'singing-cricketer'])
    expect(await slugs('industry=music&country=IN&match=any')).toEqual(['in-cricketer', 'pk-singer', 'singing-cricketer'])
  })

  it('keeps the old behaviour without match (any inside a type, all across types)', async () => {
    expect(await slugs('industry=sports,music&country=PK')).toEqual(['pk-cricketer', 'pk-singer'])
  })

  it('rejects bad country codes', async () => {
    expect((await request(app).get('/api/people?country=PAK')).status).toBe(400)
  })
})
