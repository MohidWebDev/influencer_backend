import type { Express } from 'express'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('profile_removal')
})
afterAll(teardownDb)

// Asal shakhsiyat ki public-source profile, jise talent claim karta hai (claim approve jaisa)
async function claimedProfile() {
  const { setPersonOwner } = await import('../src/services/personService')
  const talent = await loginAs(app, 'talent')
  const person = await createPerson({ headline: 'Pakistani cricketer', bio: 'From Wikipedia.' })
  await setPersonOwner(person._id, talent.user._id)
  return { ...talent, person }
}

const deleteAccount = (talent: Awaited<ReturnType<typeof claimedProfile>>, removeProfile?: boolean) =>
  talent.agent
    .delete('/api/auth/account')
    .send({ confirm: `delete ${talent.user.name}`, ...(removeProfile !== undefined && { removeProfile }) })

describe('deleting a talent account', () => {
  it('returns a public-source profile to unclaimed and undoes the owner’s edits', async () => {
    const { Person } = await import('../src/models/Person')
    const talent = await claimedProfile()
    await talent.agent
      .patch(`/api/people/${talent.person._id}`)
      .send({ bio: 'My own words, written by me.', headline: 'Captain' })
    await talent.agent.put('/api/me/availability').send({ isOpen: true, openTo: ['events'] })

    const res = await deleteAccount(talent)
    expect(res.status).toBe(200)
    expect(res.body.data.profile).toBe('unclaimed')

    const after = await Person.findById(talent.person._id).select('+publicSnapshot')
    expect(after!.claimedBy).toBeNull()
    expect(after!.verified).toBe(false)
    expect(after!.visibility).toBe('visible')
    expect(after!.bio).toBe('From Wikipedia.')
    expect(after!.headline).toBe('Pakistani cricketer')
    expect(after!.availability).toBeUndefined()
    expect(after!.publicSnapshot).toBeUndefined()
  })

  it('hides the profile and opens a removal request when the owner asks for it', async () => {
    const { Person } = await import('../src/models/Person')
    const { ProfileRemoval } = await import('../src/models/ProfileRemoval')
    const { Report } = await import('../src/models/Report')
    const { agent: admin } = await loginAs(app, 'admin')
    const talent = await claimedProfile()

    const res = await deleteAccount(talent, true)
    expect(res.body.data.profile).toBe('removal_requested')
    expect((await Person.findById(talent.person._id))!.visibility).toBe('hidden')

    const report = await Report.findOne({ person: talent.person._id })
    expect(report!.reason).toBe('removal_request')
    expect(report!.fromOwner).toBe(true)
    expect(report!.reporterEmail).toBe(talent.user.email)
    const removal = await ProfileRemoval.findOne({ report: report!._id })
    expect(removal!.status).toBe('pending')
    expect((await admin.get('/api/notifications')).body.data.notifications[0].type).toBe('report.new')

    // Mitane ke liye status "resolved" zaroori
    const wrong = await admin
      .patch(`/api/admin/reports/${report!._id}`)
      .send({ status: 'reviewing', deletePerson: true })
    expect(wrong.status).toBe(400)

    const done = await admin
      .patch(`/api/admin/reports/${report!._id}`)
      .send({ status: 'resolved', deletePerson: true, adminNote: 'Removed at the owner’s request' })
    expect(done.status).toBe(200)
    expect(await Person.findById(talent.person._id)).toBeNull()
    expect((await ProfileRemoval.findById(removal!._id))!.status).toBe('removed')

    // Seed:real is profile ko dobara nahi banayega
    const { blockedSlugs } = await import('../src/services/profileOwnershipService')
    expect((await blockedSlugs()).has(talent.person.slug)).toBe(true)
  })

  it('keeps the profile hidden when the admin decides not to delete it', async () => {
    const { Person } = await import('../src/models/Person')
    const { ProfileRemoval } = await import('../src/models/ProfileRemoval')
    const { Report } = await import('../src/models/Report')
    const { agent: admin } = await loginAs(app, 'admin')
    const talent = await claimedProfile()
    await deleteAccount(talent, true)
    const report = await Report.findOne({ person: talent.person._id })

    await admin.patch(`/api/admin/reports/${report!._id}`).send({ status: 'rejected' })
    expect((await ProfileRemoval.findOne({ report: report!._id }))!.status).toBe('kept')
    expect((await Person.findById(talent.person._id))!.visibility).toBe('hidden')
    const { blockedSlugs } = await import('../src/services/profileOwnershipService')
    expect((await blockedSlugs()).has(talent.person.slug)).toBe(false)
  })

  it('deletes a profile the talent created themselves', async () => {
    const { Person } = await import('../src/models/Person')
    const { ProfileClaim } = await import('../src/models/ProfileClaim')
    const talent = await loginAs(app, 'talent')
    const person = await createPerson({ claimedBy: talent.user._id, verified: true })
    await ProfileClaim.create({
      person: person._id,
      user: talent.user._id,
      status: 'approved',
      isNewProfile: true,
      evidence: { links: ['https://instagram.com/me'] },
    })

    const res = await talent.agent.delete('/api/auth/account').send({ confirm: `delete ${talent.user.name}` })
    expect(res.body.data.profile).toBe('deleted')
    expect(await Person.findById(person._id)).toBeNull()
  })

  it('hides an older claimed profile without a saved public version for an admin to check', async () => {
    const { Person } = await import('../src/models/Person')
    const { Report } = await import('../src/models/Report')
    const talent = await loginAs(app, 'talent')
    // Claim is feature se pehle approve hua tha: snapshot nahi
    const person = await createPerson({ claimedBy: talent.user._id, verified: true })

    const res = await talent.agent.delete('/api/auth/account').send({ confirm: `delete ${talent.user.name}` })
    expect(res.body.data.profile).toBe('hidden_for_review')
    const after = await Person.findById(person._id)
    expect(after!.visibility).toBe('hidden')
    expect(after!.claimedBy).toBeNull()
    expect((await Report.findOne({ person: person._id }))!.reason).toBe('other')
  })

  it('only deletes a profile from a removal request', async () => {
    const { agent: admin } = await loginAs(app, 'admin')
    const person = await createPerson()
    const { Report } = await import('../src/models/Report')
    const report = await Report.create({
      person: person._id,
      reason: 'incorrect_info',
      details: 'The birthday is wrong on this profile.',
      reporterEmail: 'fan@example.com',
    })
    const res = await admin
      .patch(`/api/admin/reports/${report._id}`)
      .send({ status: 'resolved', deletePerson: true })
    expect(res.status).toBe(409)
  })
})
