import type { Request, Response } from 'express'
import { isValidObjectId, type Types } from 'mongoose'
import '../types/express'
import { OPEN_REPRESENTATION_STATUSES } from '../constants/manager'
import { Agreement } from '../models/Agreement'
import { HireRequest } from '../models/HireRequest'
import { ManagerProfile } from '../models/ManagerProfile'
import { Person } from '../models/Person'
import { Representation } from '../models/Representation'
import { User } from '../models/User'
import { notifyUser } from '../services/notificationService'
import { activeRepresentation, assertCanActFor, isApprovedManager } from '../services/representationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  inviteManagerSchema,
  managerRespondSchema,
  requestRepresentationSchema,
  talentRespondSchema,
  updatePermissionsSchema,
} from '../validators/managerValidator'

const TALENT_PAGE = '/dashboard/my-manager'
const MANAGER_PAGE = '/talents'

const PERSON_POPULATE = { path: 'person', select: 'name slug photoUrl verified headline' }
const TALENT_POPULATE = { path: 'talent', select: 'name email' }
const MANAGER_POPULATE = { path: 'manager', select: 'name email' }

type RepDoc = NonNullable<Awaited<ReturnType<typeof Representation.findOne>>>

const nameOf = (doc: unknown) => (doc as { name?: string } | null)?.name ?? ''

// Manager ki professional details (talent ko dikhane ke liye)
async function managerCards(userIds: (Types.ObjectId | string)[]) {
  const profiles = await ManagerProfile.find({ owner: { $in: userIds } }).select(
    'owner agencyName websiteUrl country city bio status',
  )
  return new Map(profiles.map((p) => [String(p.owner), p]))
}

async function withManagerProfiles(reps: RepDoc[]) {
  const cards = await managerCards(reps.map((r) => (r.manager as unknown as { _id: Types.ObjectId })._id ?? r.manager))
  return reps.map((rep) => {
    const json = rep.toJSON() as unknown as Record<string, unknown> & { manager: { _id?: unknown } | string }
    const id = typeof json.manager === 'object' ? String(json.manager._id) : String(json.manager)
    const card = cards.get(id)
    json.managerProfile = card
      ? {
          agencyName: card.agencyName,
          websiteUrl: card.websiteUrl,
          country: card.country,
          city: card.city,
          bio: card.bio,
          verified: card.status === 'approved',
        }
      : null
    return json
  })
}

// Talent ki apni (claimed) profile, warna manager se jurna mumkin nahi
async function myPerson(userId: string) {
  const person = await Person.findOne({ claimedBy: userId, isDraft: false }).select('name slug')
  if (!person) throw new AppError(404, 'NO_PROFILE', 'Claim your profile first to work with a manager')
  return person
}

async function findRep(id: string, filter: Record<string, unknown>) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Request not found')
  const rep = await Representation.findOne({ _id: id, ...filter })
  if (!rep) throw new AppError(404, 'NOT_FOUND', 'Request not found')
  return rep
}

function hasManagerError() {
  return new AppError(409, 'HAS_MANAGER', 'This talent already has a manager')
}

// Rishta shuru: baqi khuli darkhwastein (is profile ki) band
async function activate(rep: RepDoc) {
  if (await activeRepresentation(rep.person)) throw hasManagerError()
  rep.set({ status: 'active', respondedAt: new Date() })
  await rep.save()
  await Representation.updateMany(
    { person: rep.person, _id: { $ne: rep._id }, status: { $in: ['invited', 'requested'] } },
    { $set: { status: 'cancelled', endedAt: new Date(), endedBy: null } },
  )
}

// ---------- Talent ki taraf ----------

// GET /api/me/manager -> mera manager (ya null), khuli darkhwastein / dawat, aur purana record
export async function getMyManager(req: Request, res: Response) {
  const reps = await Representation.find({ talent: req.user!.id })
    .populate([MANAGER_POPULATE, PERSON_POPULATE])
    .sort({ updatedAt: -1 })
    .limit(30)
  const list = await withManagerProfiles(reps)
  sendSuccess(res, {
    active: list.find((r) => r.status === 'active') ?? null,
    pending: list.filter((r) => r.status === 'invited' || r.status === 'requested'),
    history: list.filter((r) => !OPEN_REPRESENTATION_STATUSES.includes(r.status as never)).slice(0, 10),
  })
}

// POST /api/me/manager/invite -> talent kisi verified manager ko us ke email se bulata hai
export async function inviteManager(req: Request, res: Response) {
  const { email, message, permissions } = parseOrThrow(inviteManagerSchema, req.body ?? {})
  const person = await myPerson(req.user!.id)

  const manager = await User.findOne({ email, role: 'representative', status: 'active' }).select('name')
  if (!manager || !(await isApprovedManager(manager._id))) {
    throw new AppError(404, 'MANAGER_NOT_FOUND', 'No verified manager uses this email', {
      email: 'No verified manager uses this email',
    })
  }
  if (await activeRepresentation(person._id)) throw hasManagerError()
  if (await Representation.exists({ person: person._id, manager: manager._id, status: { $in: ['invited', 'requested'] } })) {
    throw new AppError(409, 'ALREADY_PENDING', 'There is already an open request with this manager')
  }

  const rep = await Representation.create({
    manager: manager._id,
    talent: req.user!.id,
    person: person._id,
    status: 'invited',
    initiatedBy: 'talent',
    message,
    permissions,
  })
  const talent = await User.findById(req.user!.id).select('name')
  await notifyUser(manager._id, {
    type: 'representation.invited',
    data: { name: talent?.name ?? '', person: person.name },
    link: MANAGER_PAGE,
  })
  sendSuccess(res, { representation: rep }, 201)
}

// POST /api/me/manager/:id/respond -> manager ki darkhwast: haan (ijazat ke saath) ya na
export async function talentRespond(req: Request, res: Response) {
  const { action, permissions } = parseOrThrow(talentRespondSchema, req.body ?? {})
  const rep = await findRep(String(req.params.id), { talent: req.user!.id, status: 'requested' })

  if (action === 'accept') {
    if (!(await isApprovedManager(rep.manager))) {
      throw new AppError(409, 'MANAGER_NOT_VERIFIED', 'This manager is no longer verified')
    }
    rep.permissions = permissions ?? { manageProfile: false, handleHires: false }
    await activate(rep)
  } else {
    rep.set({ status: 'declined', respondedAt: new Date() })
    await rep.save()
  }
  await rep.populate(PERSON_POPULATE)
  const talent = await User.findById(req.user!.id).select('name')
  await notifyUser(rep.manager, {
    type: action === 'accept' ? 'representation.accepted' : 'representation.declined',
    data: { name: talent?.name ?? '', person: nameOf(rep.person) },
    link: MANAGER_PAGE,
  })
  sendSuccess(res, { representation: rep })
}

// PATCH /api/me/manager/:id -> chalte rishte ki ijazat badlo
export async function updatePermissions(req: Request, res: Response) {
  const { permissions } = parseOrThrow(updatePermissionsSchema, req.body ?? {})
  const rep = await findRep(String(req.params.id), { talent: req.user!.id, status: 'active' })
  rep.permissions = permissions
  await rep.save()
  sendSuccess(res, { representation: rep })
}

// POST /api/me/manager/:id/end -> rishta khatam (ya apni dawat wapas)
export async function talentEnd(req: Request, res: Response) {
  const rep = await findRep(String(req.params.id), {
    talent: req.user!.id,
    status: { $in: ['active', 'invited'] },
  })
  const wasActive = rep.status === 'active'
  rep.set({ status: wasActive ? 'ended' : 'cancelled', endedAt: new Date(), endedBy: req.user!.id })
  await rep.save()
  if (wasActive) {
    await rep.populate(PERSON_POPULATE)
    const talent = await User.findById(req.user!.id).select('name')
    await notifyUser(rep.manager, {
      type: 'representation.ended',
      data: { name: talent?.name ?? '', person: nameOf(rep.person) },
      link: MANAGER_PAGE,
    })
  }
  sendSuccess(res, { representation: rep })
}

// ---------- Manager ki taraf ----------

// GET /api/manager/representations -> dawat, darkhwastein aur purana record
export async function listMyRepresentations(req: Request, res: Response) {
  const reps = await Representation.find({ manager: req.user!.id })
    .populate([PERSON_POPULATE, TALENT_POPULATE])
    .sort({ updatedAt: -1 })
    .limit(100)
  sendSuccess(res, { representations: reps })
}

// POST /api/manager/representations -> kisi talent ko represent karne ki darkhwast
export async function requestRepresentation(req: Request, res: Response) {
  const { personId, message } = parseOrThrow(requestRepresentationSchema, req.body ?? {})
  if (!(await isApprovedManager(req.user!.id))) {
    throw new AppError(403, 'MANAGER_NOT_VERIFIED', 'Get your manager account verified first')
  }
  const person = await Person.findOne({ _id: personId, visibility: 'visible', isDraft: false }).select(
    'name claimedBy',
  )
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  // Sirf us talent se jo platform pe hai (profile claim ki hui)
  if (!person.claimedBy) {
    throw new AppError(409, 'TALENT_NOT_ON_PLATFORM', 'This talent has not joined the platform yet')
  }
  if (await activeRepresentation(person._id)) throw hasManagerError()
  if (await Representation.exists({ person: person._id, manager: req.user!.id, status: { $in: ['invited', 'requested'] } })) {
    throw new AppError(409, 'ALREADY_PENDING', 'There is already an open request with this talent')
  }

  const rep = await Representation.create({
    manager: req.user!.id,
    talent: person.claimedBy,
    person: person._id,
    status: 'requested',
    initiatedBy: 'manager',
    message,
  })
  const manager = await User.findById(req.user!.id).select('name')
  await notifyUser(person.claimedBy, {
    type: 'representation.requested',
    data: { name: manager?.name ?? '', person: person.name },
    link: TALENT_PAGE,
  })
  sendSuccess(res, { representation: rep }, 201)
}

// POST /api/manager/representations/:id/respond -> talent ki dawat: haan ya na
export async function managerRespond(req: Request, res: Response) {
  const { action } = parseOrThrow(managerRespondSchema, req.body ?? {})
  const rep = await findRep(String(req.params.id), { manager: req.user!.id, status: 'invited' })

  if (action === 'accept') {
    if (!(await isApprovedManager(req.user!.id))) {
      throw new AppError(403, 'MANAGER_NOT_VERIFIED', 'Get your manager account verified first')
    }
    await activate(rep)
  } else {
    rep.set({ status: 'declined', respondedAt: new Date() })
    await rep.save()
  }
  await rep.populate(PERSON_POPULATE)
  const manager = await User.findById(req.user!.id).select('name')
  await notifyUser(rep.talent, {
    type: action === 'accept' ? 'representation.accepted' : 'representation.declined',
    data: { name: manager?.name ?? '', person: nameOf(rep.person) },
    link: TALENT_PAGE,
  })
  sendSuccess(res, { representation: rep })
}

// POST /api/manager/representations/:id/end -> rishta khatam (ya apni darkhwast wapas)
export async function managerEnd(req: Request, res: Response) {
  const rep = await findRep(String(req.params.id), {
    manager: req.user!.id,
    status: { $in: ['active', 'requested'] },
  })
  const wasActive = rep.status === 'active'
  rep.set({ status: wasActive ? 'ended' : 'cancelled', endedAt: new Date(), endedBy: req.user!.id })
  await rep.save()
  if (wasActive) {
    await rep.populate(PERSON_POPULATE)
    const manager = await User.findById(req.user!.id).select('name')
    await notifyUser(rep.talent, {
      type: 'representation.ended',
      data: { name: manager?.name ?? '', person: nameOf(rep.person) },
      link: TALENT_PAGE,
    })
  }
  sendSuccess(res, { representation: rep })
}

// GET /api/manager/talents -> mere talents (roster) aur har ek pe kya baqi hai
export async function listMyTalents(req: Request, res: Response) {
  const reps = await Representation.find({ manager: req.user!.id, status: 'active' })
    .populate([
      {
        path: 'person',
        select: 'name slug photoUrl verified headline totalFollowers availability services claimedBy',
      },
      TALENT_POPULATE,
    ])
    .sort({ respondedAt: -1 })
  // Profile ab us talent ki na rahi ho to roster mein nahi
  const live = reps.filter((rep) => {
    const person = rep.person as unknown as { claimedBy?: unknown } | null
    return person && String(person.claimedBy) === String((rep.talent as unknown as { _id: unknown })._id)
  })
  const personIds = live.map((rep) => (rep.person as unknown as { _id: Types.ObjectId })._id)
  const [hires, agreements] = await Promise.all([
    HireRequest.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { person: { $in: personIds }, status: 'pending' } },
      { $group: { _id: '$person', count: { $sum: 1 } } },
    ]),
    Agreement.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { person: { $in: personIds }, status: { $in: ['negotiating', 'active', 'disputed'] } } },
      { $group: { _id: '$person', count: { $sum: 1 } } },
    ]),
  ])
  const hireCount = new Map(hires.map((h) => [String(h._id), h.count]))
  const agreementCount = new Map(agreements.map((a) => [String(a._id), a.count]))

  const talents = live.map((rep) => {
    const person = rep.person as unknown as {
      _id: Types.ObjectId
      name: string
      slug: string
      photoUrl?: string
      verified: boolean
      headline?: string
      totalFollowers?: number
      availability?: { isOpen?: boolean }
      services: { isActive: boolean }[]
    }
    return {
      representationId: rep._id,
      since: rep.respondedAt ?? rep.updatedAt,
      permissions: rep.permissions,
      person: {
        _id: person._id,
        name: person.name,
        slug: person.slug,
        photoUrl: person.photoUrl,
        verified: person.verified,
        headline: person.headline,
        totalFollowers: person.totalFollowers ?? 0,
        isOpen: Boolean(person.availability?.isOpen),
        liveServices: person.services.filter((s) => s.isActive).length,
      },
      pendingHires: hireCount.get(String(person._id)) ?? 0,
      openAgreements: agreementCount.get(String(person._id)) ?? 0,
    }
  })
  sendSuccess(res, { talents })
}

// GET /api/manager/talents/:personId -> ek talent ki profile (edit form ke liye) aur meri ijazat
export async function getMyTalent(req: Request, res: Response) {
  const personId = String(req.params.personId)
  if (!isValidObjectId(personId)) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  const rep = await activeRepresentation(personId)
  if (!rep || String(rep.manager) !== req.user!.id) {
    throw new AppError(403, 'NOT_YOUR_TALENT', 'You do not represent this talent')
  }
  const person = await Person.findById(personId).populate([
    { path: 'professions', select: 'name slug' },
    { path: 'industries', select: 'name slug' },
    { path: 'topics', select: 'name slug' },
  ])
  sendSuccess(res, { person, permissions: rep.permissions, representationId: rep._id })
}
