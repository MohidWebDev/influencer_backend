import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('admin_reports')
})
afterAll(teardownDb)

describe('reports', () => {
  it('lets a guest report a profile (email required)', async () => {
    const person = await createPerson()
    const base = { personId: String(person._id), reason: 'incorrect_info', details: 'The follower count is wrong' }

    const noEmail = await request(app).post('/api/reports').send(base)
    expect(noEmail.status).toBe(400)
    expect(noEmail.body.error.fields.reporterEmail).toBeDefined()

    const ok = await request(app).post('/api/reports').send({ ...base, reporterEmail: 'guest@test.com' })
    expect(ok.status).toBe(201)
    expect(ok.body.data.report.status).toBe('open')
  })

  it('admin lists, opens and resolves a report with takedown and audit logs', async () => {
    const person = await createPerson()
    const { agent: reporter } = await loginAs(app, 'business')
    const created = await reporter
      .post('/api/reports')
      .send({ personId: String(person._id), reason: 'removal_request', details: 'Please remove this profile' })
    const reportId = created.body.data.report._id

    const { agent } = await loginAs(app, 'admin')
    const list = await agent.get('/api/admin/reports?status=open')
    expect(list.status).toBe(200)
    expect(list.body.data.reports.some((r: { _id: string }) => r._id === reportId)).toBe(true)

    const detail = await agent.get(`/api/admin/reports/${reportId}`)
    expect(detail.body.data.report.person.name).toBe(person.name)

    const update = await agent
      .patch(`/api/admin/reports/${reportId}`)
      .send({ status: 'resolved', adminNote: 'Removed on request', hidePerson: true })
    expect(update.status).toBe(200)
    expect(update.body.data.report.status).toBe('resolved')
    expect(update.body.data.report.adminNote).toBe('Removed on request')

    const { Person } = await import('../src/models/Person')
    expect((await Person.findById(person._id))?.visibility).toBe('hidden')

    const logs = await agent.get('/api/admin/audit-logs?action=person.hide')
    expect(logs.body.data.logs[0].targetId).toBe(String(person._id))
    const reportLogs = await agent.get(`/api/admin/audit-logs?targetType=report&targetId=${reportId}`)
    expect(reportLogs.body.data.logs[0].after.status).toBe('resolved')
  })

  it('blocks non-admins from the queue', async () => {
    const person = await createPerson()
    const created = await request(app)
      .post('/api/reports')
      .send({ personId: String(person._id), reason: 'other', details: 'Something is wrong here', reporterEmail: 'a@b.com' })
    const { agent } = await loginAs(app, 'talent')
    expect((await agent.get('/api/admin/reports')).status).toBe(403)
    expect((await agent.get(`/api/admin/reports/${created.body.data.report._id}`)).status).toBe(403)
    expect((await agent.patch(`/api/admin/reports/${created.body.data.report._id}`).send({ status: 'resolved' })).status).toBe(403)
  })

  it('does not allow moving a report back to open', async () => {
    const person = await createPerson()
    const created = await request(app)
      .post('/api/reports')
      .send({ personId: String(person._id), reason: 'other', details: 'Something is wrong here', reporterEmail: 'a@b.com' })
    const { agent } = await loginAs(app, 'admin')
    const res = await agent.patch(`/api/admin/reports/${created.body.data.report._id}`).send({ status: 'open' })
    expect(res.status).toBe(400)
  })
})
