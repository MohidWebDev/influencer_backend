import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express
const dir = path.join(os.tmpdir(), `uploads-test-${Date.now()}`)

// Asal 1x1 PNG (pehli bytes se pehchani jati hai)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

beforeAll(async () => {
  process.env.UPLOAD_DIR = dir
  process.env.UPLOAD_DRIVER = 'disk'
  app = await setupApp('uploads')
})
afterAll(async () => {
  delete process.env.UPLOAD_DRIVER
  await fs.rm(dir, { recursive: true, force: true })
  await teardownDb()
})

const upload = (agent: request.Agent, url: string, file = PNG, name = 'me.png', type = 'image/png') =>
  agent.put(url).attach('photo', file, { filename: name, contentType: type })

describe('photo uploads', () => {
  it('lets every kind of account upload, replace and remove their photo', async () => {
    for (const role of ['admin', 'talent', 'representative', 'business'] as const) {
      const { agent } = await loginAs(app, role)
      const first = await upload(agent, '/api/account/avatar')
      expect(first.status).toBe(200)
      const url = first.body.data.user.avatarUrl as string
      expect(url).toMatch(/^\/api\/uploads\/[a-f0-9]{24}\.png$/)
      // Folder mein file
      expect((await fs.readdir(dir)).includes(url.split('/').pop()!)).toBe(true)

      const served = await request(app).get(url)
      expect(served.status).toBe(200)
      expect(served.headers['content-type']).toBe('image/png')
      expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0)

      // Nayi photo: purani file mit jati hai
      const second = await upload(agent, '/api/account/avatar')
      expect(second.body.data.user.avatarUrl).not.toBe(url)
      expect((await request(app).get(url)).status).toBe(404)
      expect((await agent.get('/api/auth/me')).body.data.user.avatarUrl).toBe(second.body.data.user.avatarUrl)

      const removed = await agent.delete('/api/account/avatar')
      expect(removed.body.data.user.avatarUrl).toBeUndefined()
      expect((await request(app).get(second.body.data.user.avatarUrl)).status).toBe(404)
    }
  })

  it('rejects files that are not images, too big, missing, or from guests', async () => {
    const { agent } = await loginAs(app, 'talent')
    const fake = await upload(agent, '/api/account/avatar', Buffer.from('<script>alert(1)</script>'), 'x.png')
    expect(fake.body.error.code).toBe('INVALID_IMAGE')
    const pdf = await upload(agent, '/api/account/avatar', PNG, 'x.pdf', 'application/pdf')
    expect(pdf.body.error.code).toBe('INVALID_IMAGE')
    const big = await upload(agent, '/api/account/avatar', Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]))
    expect(big.body.error.code).toBe('FILE_TOO_LARGE')
    expect((await agent.put('/api/account/avatar')).body.error.code).toBe('NO_FILE')
    expect((await upload(request.agent(app), '/api/account/avatar')).status).toBe(401)
    expect((await request(app).get('/api/uploads/../../etc/passwd')).status).toBe(404)
    expect((await request(app).get('/api/uploads/nope.png')).status).toBe(404)
  })

  it('lets the talent, their manager or an admin (unclaimed only) set the profile photo', async () => {
    const { Representation } = await import('../src/models/Representation')
    const { ManagerProfile } = await import('../src/models/ManagerProfile')
    const talent = await loginAs(app, 'talent')
    const person = await createPerson({ claimedBy: talent.user._id, photoCredit: { author: 'Someone', sourceUrl: 'https://commons.wikimedia.org/x', license: 'CC BY 4.0', provider: 'wikimedia' } })

    const own = await upload(talent.agent, `/api/people/${person._id}/photo`)
    expect(own.body.data.photoUrl).toMatch(/^\/api\/uploads\//)
    const profile = await request(app).get(`/api/people/${person.slug}`)
    expect(profile.body.data.person.photoUrl).toBe(own.body.data.photoUrl)
    expect(profile.body.data.person.photoCredit).toBeUndefined()

    const stranger = await loginAs(app, 'talent')
    expect((await upload(stranger.agent, `/api/people/${person._id}/photo`)).status).toBe(403)
    const admin = await loginAs(app, 'admin')
    expect((await upload(admin.agent, `/api/people/${person._id}/photo`)).status).toBe(403)
    const unclaimed = await createPerson()
    expect((await upload(admin.agent, `/api/people/${unclaimed._id}/photo`)).status).toBe(200)

    const manager = await loginAs(app, 'representative')
    await ManagerProfile.create({
      owner: manager.user._id,
      country: 'PK',
      socialAccounts: [{ platform: 'instagram', url: 'https://instagram.com/m' }],
      status: 'approved',
    })
    await Representation.create({
      manager: manager.user._id,
      talent: talent.user._id,
      person: person._id,
      status: 'active',
      initiatedBy: 'talent',
      permissions: { manageProfile: true, handleHires: false },
    })
    expect((await upload(manager.agent, `/api/people/${person._id}/photo`)).status).toBe(200)
    const cleared = await talent.agent.delete(`/api/people/${person._id}/photo`)
    expect(cleared.body.data.photoUrl).toBeNull()
  })

  it('stores in MongoDB when there is no disk (Vercel) and shows logos in the directory', async () => {
    process.env.UPLOAD_DRIVER = 'mongo'
    const { UploadedImage } = await import('../src/models/UploadedImage')
    const business = await loginAs(app, 'business')
    const res = await upload(business.agent, '/api/account/avatar')
    const url = res.body.data.user.avatarUrl as string
    expect(await UploadedImage.countDocuments()).toBe(1)
    expect((await fs.readdir(dir)).includes(url.split('/').pop()!)).toBe(false)
    expect((await request(app).get(url)).headers['content-type']).toBe('image/png')

    const list = await request(app).get('/api/directory/businesses')
    expect(list.body.data.businesses.find((b: { _id: string }) => b._id === String(business.user._id)).logoUrl).toBe(url)

    await business.agent.delete('/api/auth/account').send({ confirm: `delete ${business.user.name}` })
    expect(await UploadedImage.countDocuments()).toBe(0)
    process.env.UPLOAD_DRIVER = 'disk'
  })
})
