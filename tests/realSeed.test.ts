import type { Express } from 'express'
import request from 'supertest'
import { loginAs, setupApp, teardownDb } from './helpers'

let app: Express
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

// Har title ke liye Wikipedia ka nakli jawab
const SPECIAL: Record<string, 'missing' | 'local' | 'nc' | 'offline'> = {
  Rihanna: 'local',
  Huda_Kattan: 'nc',
  Ducky_Bhai: 'missing',
}
let offline = new Set<string>()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeAll(async () => {
  app = await setupApp('real_seed')
  const { Industry, Profession, Topic } = await import('../src/models/taxonomy')
  const { INDUSTRIES, PROFESSIONS, TOPICS } = await import('../src/seed/taxonomyData')
  const { slugify } = await import('../src/utils/slugify')
  for (const [M, names] of [[Profession, PROFESSIONS], [Industry, INDUSTRIES], [Topic, TOPICS]] as const) {
    await M.insertMany(names.map((name, order) => ({ name, slug: slugify(name), order })))
  }

  jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input))
    if (url.host === 'en.wikipedia.org') {
      const title = decodeURIComponent(url.pathname.split('/').pop()!)
      if (offline.has(title)) throw new Error('getaddrinfo ENOTFOUND')
      const kind = SPECIAL[title]
      if (kind === 'missing') return json({}, 404)
      const folder = kind === 'local' ? 'en' : 'commons'
      return json({
        originalimage: { source: `https://upload.wikimedia.org/wikipedia/${folder}/a/ab/${title}.jpg` },
        content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } },
      })
    }
    if (url.host === 'commons.wikimedia.org') {
      const file = url.searchParams.get('titles')!.replace('File:', '')
      const nc = file.startsWith('Huda_Kattan')
      return json({
        query: {
          pages: [
            {
              imageinfo: [
                {
                  url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${file}`,
                  thumburl: `https://upload.wikimedia.org/thumb/${file}/600px-${file}`,
                  thumbwidth: 600,
                  descriptionurl: `https://commons.wikimedia.org/wiki/File:${file}`,
                  extmetadata: {
                    LicenseShortName: { value: nc ? 'CC BY-NC 2.0' : 'CC BY-SA 4.0' },
                    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
                    Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane &amp; Co</a>' },
                  },
                },
              ],
            },
          ],
        },
      })
    }
    return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
  })
})
afterAll(async () => {
  jest.restoreAllMocks()
  await teardownDb()
})

describe('real people seed', () => {
  it('replaces demo people, stores free photos and is safe to run again', async () => {
    const { Person } = await import('../src/models/Person')
    const { PersonPhoto } = await import('../src/models/PersonPhoto')
    const { ProfileClaim } = await import('../src/models/ProfileClaim')
    const { User } = await import('../src/models/User')
    const { seedRealPeople } = await import('../src/seed/peopleSeed')
    jest.spyOn(console, 'log').mockImplementation(() => undefined)

    const { user } = await loginAs(app, 'talent')
    const demo = await Person.create({ name: 'Fake Person', slug: 'fake-person', isDemo: true })
    await ProfileClaim.create({ person: demo._id, user: user._id, status: 'pending' }).catch(() => undefined)
    const usersBefore = await User.countDocuments()

    await seedRealPeople(true)

    expect(await Person.exists({ slug: 'fake-person' })).toBeNull()
    expect(await User.countDocuments()).toBe(usersBefore)
    expect(await Person.countDocuments()).toBe(30)

    const babar = await Person.findOne({ slug: 'babar-azam' }).populate('professions industries')
    expect(babar!.claimedBy).toBeNull()
    expect(babar!.verified).toBe(false)
    expect(babar!.roles).toEqual(['talent'])
    expect(babar!.country).toBe('PK')
    expect(babar!.sourceRecords[0].sourceType).toBe('wikipedia')
    expect(babar!.sourceRecords[0].url).toBe('https://en.wikipedia.org/wiki/Babar_Azam')
    expect(babar!.photoUrl).toMatch(/^\/api\/people\/photos\/[a-f0-9]{24}$/)
    expect(babar!.photoCredit).toMatchObject({
      provider: 'Wikimedia Commons',
      author: 'Jane & Co',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Babar_Azam.jpg',
    })

    // Non-free, Commons pe nahi, ya article nahi -> initials avatar
    for (const slug of ['rihanna', 'huda-kattan', 'ducky-bhai']) {
      const p = await Person.findOne({ slug })
      expect(p!.photoUrl).toBeUndefined()
      expect(p!.photoCredit).toBeUndefined()
    }

    // Photo khud hamare server se aati hai
    const photo = await request(app).get(babar!.photoUrl!)
    expect(photo.status).toBe(200)
    expect(photo.headers['content-type']).toBe('image/png')
    expect(photo.headers['cache-control']).toContain('immutable')
    expect(Buffer.compare(photo.body, PNG)).toBe(0)

    // Public API: filter by industry / profession, slug wala profile
    const cricketers = await request(app).get('/api/people?profession=cricketer&limit=50')
    expect(cricketers.body.data.people.map((p: { slug: string }) => p.slug).sort()).toEqual([
      'babar-azam',
      'shahid-afridi',
      'virat-kohli',
    ])
    const film = await request(app).get('/api/people?industry=film-tv&limit=50')
    expect(film.body.meta.total).toBe(6)
    const profile = await request(app).get('/api/people/babar-azam')
    expect(profile.body.data.person.photoCredit.license).toBe('CC BY-SA 4.0')

    // Dobara chalao: claim hua profile wesa hi, koi duplicate nahi, purani photo saaf.
    // Network gaya to purani photo rehti hai
    await Person.updateOne({ slug: 'mahira-khan' }, { $set: { claimedBy: user._id } })
    const oldFawad = (await Person.findOne({ slug: 'fawad-khan' }))!.photoUrl
    offline = new Set(['Fawad_Khan'])
    await seedRealPeople(true)
    expect(await Person.countDocuments()).toBe(30)
    expect((await Person.findOne({ slug: 'mahira-khan' }))!.claimedBy?.toString()).toBe(user.id)
    expect((await Person.findOne({ slug: 'fawad-khan' }))!.photoUrl).toBe(oldFawad)
    expect(await PersonPhoto.countDocuments()).toBe(27)
    expect((await request(app).get(babar!.photoUrl!)).status).toBe(404)
  })

  it('accepts its own photo path when an admin edits the profile', async () => {
    const { Person } = await import('../src/models/Person')
    const { agent } = await loginAs(app, 'admin')
    const person = await Person.findOne({ slug: 'mark-rober' })
    const res = await agent.patch(`/api/people/${person!.id}`).send({ photoUrl: person!.photoUrl, bio: 'Updated.' })
    expect(res.status).toBe(200)
    expect(res.body.data.person.photoCredit).toBeTruthy()
    // Nayi bahar ki photo -> purana credit hat jata hai
    const changed = await agent.patch(`/api/people/${person!.id}`).send({ photoUrl: 'https://example.com/a.jpg' })
    expect(changed.body.data.person.photoCredit).toBeUndefined()
  })
})
