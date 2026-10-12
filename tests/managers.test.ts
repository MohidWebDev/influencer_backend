import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('managers')
})
afterAll(teardownDb)

const MANAGER_DETAILS = {
  agencyName: 'Star Talent',
  websiteUrl: 'https://linkedin.com/in/ali-manager',
  country: 'pk',
  talentsCount: 4,
  proofLinks: ['https://startalent.example.com'],
}

// Manager details bhejo aur admin se approve karwao
async function verifiedManager() {
  const manager = await loginAs(app, 'representative')
  const saved = await manager.agent.put('/api/manager/profile').send(MANAGER_DETAILS)
  expect(saved.status).toBe(201)
  expect(saved.body.data.manager.status).toBe('pending')
  const { agent: admin } = await loginAs(app, 'admin')
  const approved = await admin
    .patch(`/api/admin/managers/${saved.body.data.manager._id}`)
    .send({ action: 'approve' })
  expect(approved.body.data.manager.status).toBe('approved')
  // "Verified manager" notification ka data khali hai, phir bhi object aana chahiye
  const notes = await manager.agent.get('/api/notifications')
  const note = notes.body.data.notifications.find((n: { type: string }) => n.type === 'manager.approved')
  expect(note.data).toEqual({})
  return { ...manager, managerProfileId: saved.body.data.manager._id as string, admin }
}

async function talentWithProfile() {
  const talent = await loginAs(app, 'talent')
  const person = await createPerson({ claimedBy: talent.user._id, verified: true })
  return { ...talent, person }
}

describe('managers', () => {
  it('needs admin approval before linking to talents', async () => {
    const manager = await loginAs(app, 'representative')
    const { person } = await talentWithProfile()
    const early = await manager.agent.post('/api/manager/representations').send({ personId: String(person._id) })
    expect(early.status).toBe(403)
    expect(early.body.error.code).toBe('MANAGER_NOT_VERIFIED')
    // Talent sirf verified manager ko bula sakta hai
    const talent = await talentWithProfile()
    const invite = await talent.agent.post('/api/me/manager/invite').send({ email: manager.user.email })
    expect(invite.status).toBe(404)
  })

  it('links on the talent’s approval, with only the permissions the talent gives', async () => {
    const manager = await verifiedManager()
    const talent = await talentWithProfile()
    const personId = String(talent.person._id)

    const asked = await manager.agent
      .post('/api/manager/representations')
      .send({ personId, message: 'I manage creators in Lahore.' })
    expect(asked.status).toBe(201)
    const repId = asked.body.data.representation._id

    const mine = await talent.agent.get('/api/me/manager')
    expect(mine.body.data.pending).toHaveLength(1)
    expect(mine.body.data.pending[0].managerProfile.verified).toBe(true)

    const accepted = await talent.agent
      .post(`/api/me/manager/${repId}/respond`)
      .send({ action: 'accept', permissions: { manageProfile: false, handleHires: true } })
    expect(accepted.body.data.representation.status).toBe('active')

    const roster = await manager.agent.get('/api/manager/talents')
    expect(roster.body.data.talents).toHaveLength(1)
    expect(roster.body.data.talents[0].person._id).toBe(personId)

    // Profile badalne ki ijazat nahi
    const service = {
      title: 'Keynote talk',
      category: 'keynote',
      pricing: { type: 'fixed', currency: 'PKR', unit: 'event', amount: 250000 },
    }
    const denied = await manager.agent.post(`/api/me/services?person=${personId}`).send(service)
    expect(denied.status).toBe(403)
    const edit = await manager.agent.patch(`/api/people/${personId}`).send({ headline: 'New headline' })
    expect(edit.status).toBe(403)

    // Talent ijazat deta hai, ab manager kar sakta hai
    await talent.agent.patch(`/api/me/manager/${repId}`).send({ permissions: { manageProfile: true, handleHires: true } })
    const created = await manager.agent.post(`/api/me/services?person=${personId}`).send(service)
    expect(created.status).toBe(201)
    const edited = await manager.agent.patch(`/api/people/${personId}`).send({ headline: 'New headline' })
    expect(edited.status).toBe(200)

    // Public profile pe "represented by"
    const publicProfile = await request(app).get(`/api/people/${talent.person.slug}`)
    expect(publicProfile.body.data.person.representedBy).toEqual({ name: manager.user.name, agencyName: 'Star Talent' })

    // Ek talent ka ek hi manager
    const other = await verifiedManager()
    const second = await other.agent.post('/api/manager/representations').send({ personId })
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('HAS_MANAGER')

    // Talent rishta khatam kare to manager kuch nahi kar sakta
    await talent.agent.post(`/api/me/manager/${repId}/end`)
    const after = await manager.agent.get(`/api/me/services?person=${personId}`)
    expect(after.status).toBe(403)
    expect((await manager.agent.get('/api/manager/talents')).body.data.talents).toHaveLength(0)
  })

  it('lets the manager answer hire requests and tells the talent', async () => {
    const { BusinessProfile } = await import('../src/models/BusinessProfile')
    const { Notification } = await import('../src/models/Notification')
    const manager = await verifiedManager()
    const talent = await talentWithProfile()
    const personId = String(talent.person._id)

    // Talent bulata hai, manager haan karta hai
    const invite = await talent.agent
      .post('/api/me/manager/invite')
      .send({ email: manager.user.email, permissions: { manageProfile: false, handleHires: true } })
    expect(invite.status).toBe(201)
    await manager.agent.post(`/api/manager/representations/${invite.body.data.representation._id}/respond`).send({ action: 'accept' })

    const business = await loginAs(app, 'business')
    await BusinessProfile.create({
      owner: business.user._id,
      companyName: 'Acme Foods',
      websiteUrl: 'https://acme.example.com',
      country: 'PK',
      status: 'approved',
    })
    const hire = await business.agent.post('/api/business/hires').send({
      personId,
      title: 'Spring campaign',
      message: 'We would love you to front our spring snack campaign on Instagram.',
    })
    expect(hire.status).toBe(201)
    expect(await Notification.exists({ recipient: manager.user._id, type: 'hire.new_managed' })).toBeTruthy()

    const inbox = await manager.agent.get('/api/me/hire-requests')
    expect(inbox.body.data.hires).toHaveLength(1)
    const hireId = inbox.body.data.hires[0]._id
    const answered = await manager.agent.patch(`/api/me/hire-requests/${hireId}`).send({ action: 'accept' })
    expect(answered.status).toBe(200)
    expect(answered.body.data.hire.respondedBy.name).toBe(manager.user.name)
    expect(await Notification.exists({ recipient: talent.user._id, type: 'hire.answered_by_manager' })).toBeTruthy()

    // Kisi aur ke talent ki request nahi
    const stranger = await verifiedManager()
    expect((await stranger.agent.patch(`/api/me/hire-requests/${hireId}`).send({ action: 'decline' })).status).toBe(404)
  })

  it('ends every link when the admin withdraws verification', async () => {
    const manager = await verifiedManager()
    const talent = await talentWithProfile()
    const asked = await manager.agent.post('/api/manager/representations').send({ personId: String(talent.person._id) })
    await talent.agent
      .post(`/api/me/manager/${asked.body.data.representation._id}/respond`)
      .send({ action: 'accept', permissions: { manageProfile: true, handleHires: true } })

    const rejected = await manager.admin
      .patch(`/api/admin/managers/${manager.managerProfileId}`)
      .send({ action: 'reject', reason: 'Proof did not check out' })
    expect(rejected.body.data.manager.status).toBe('rejected')
    expect(rejected.body.data.representations[0].status).toBe('ended')
    expect((await talent.agent.get('/api/me/manager')).body.data.active).toBeNull()
  })
})
