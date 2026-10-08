import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('notifications')
})
afterAll(teardownDb)

const LINK = 'https://instagram.com/notify-test'

describe('notifications', () => {
  it('tells admins about a new claim and links to the claim page', async () => {
    const admin = await loginAs(app, 'admin')
    const talent = await loginAs(app, 'talent')
    const person = await createPerson({ name: 'Notify Person' })

    const before = (await admin.agent.get('/api/notifications/unread-count')).body.data.unread
    const created = await talent.agent.post('/api/claims').send({ personId: person._id, links: [LINK] })
    const claimId = created.body.data.claim._id

    const count = await admin.agent.get('/api/notifications/unread-count')
    expect(count.body.data.unread).toBe(before + 1)

    const list = await admin.agent.get('/api/notifications')
    const latest = list.body.data.notifications[0]
    expect(latest.type).toBe('claim.new')
    expect(latest.link).toBe(`/admin/claims/${claimId}`)
    expect(latest.data.person).toBe('Notify Person')
    expect(latest.data.claimant).toBe(talent.user.name)
    expect(latest.readAt).toBeNull()
    expect(list.body.data.unread).toBe(before + 1)

    // Parh li
    const read = await admin.agent.patch(`/api/notifications/${latest._id}/read`)
    expect(read.status).toBe(200)
    expect(read.body.data.notification.readAt).toBeTruthy()
    expect((await admin.agent.get('/api/notifications/unread-count')).body.data.unread).toBe(before)

    // Kisi aur ki notification nahi chhed sakta
    expect((await talent.agent.patch(`/api/notifications/${latest._id}/read`)).status).toBe(404)
  })

  it('notifies the talent when the code is sent and when the claim is approved', async () => {
    const admin = await loginAs(app, 'admin')
    const talent = await loginAs(app, 'talent')
    const person = await createPerson()
    const created = await talent.agent.post('/api/claims').send({ personId: person._id, links: [LINK] })
    const id = created.body.data.claim._id

    const sent = await admin.agent.post(`/api/admin/claims/${id}/code`).send({ channelUrl: LINK })
    await talent.agent.post(`/api/claims/${id}/verify`).send({ code: sent.body.data.code })

    // Admin ko: talent ne sahi code daala
    const adminList = await admin.agent.get('/api/notifications')
    expect(adminList.body.data.notifications[0].type).toBe('claim.code_verified')

    await admin.agent.patch(`/api/admin/claims/${id}`).send({ action: 'approve' })
    const mine = await talent.agent.get('/api/notifications')
    const types = mine.body.data.notifications.map((n: { type: string }) => n.type)
    expect(types).toEqual(['claim.approved', 'claim.code_sent'])

    const all = await talent.agent.post('/api/notifications/read-all')
    expect(all.body.data.updated).toBe(2)
    expect((await talent.agent.get('/api/notifications?unread=true')).body.meta.total).toBe(0)
  })

  it('tells admins about a new report but not suspended admins', async () => {
    const admin = await loginAs(app, 'admin')
    const suspended = await loginAs(app, 'admin', { status: 'suspended' })
    const person = await createPerson({ name: 'Reported Person' })

    const res = await request(app).post('/api/reports').send({
      personId: person._id,
      reason: 'incorrect_info',
      details: 'The follower count is wrong',
      reporterEmail: 'guest@test.com',
    })
    expect(res.status).toBe(201)

    const list = await admin.agent.get('/api/notifications')
    expect(list.body.data.notifications[0].type).toBe('report.new')
    expect(list.body.data.notifications[0].link).toBe(`/admin/reports/${res.body.data.report._id}`)

    const { Notification } = await import('../src/models/Notification')
    expect(await Notification.countDocuments({ recipient: suspended.user._id })).toBe(0)
  })

  it('needs login', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401)
  })
})
