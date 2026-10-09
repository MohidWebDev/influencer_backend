import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import '../types/express'
import { businessRatings } from './agreementController'
import { BusinessProfile } from '../models/BusinessProfile'
import { HireRequest } from '../models/HireRequest'
import { Person } from '../models/Person'
import { User } from '../models/User'
import { notifyUser } from '../services/notificationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import { createHireSchema, respondHireSchema } from '../validators/businessValidator'

// Dashboard ka hire requests wala page (talent aur business dono ke liye)
const HIRES_LINK = '/dashboard/hire-requests'

const PERSON_POPULATE = { path: 'person', select: 'name slug headline photoUrl verified' }
const BUSINESS_POPULATE = {
  path: 'businessProfile',
  select: 'companyName websiteUrl industry companySize description country city status contactPhone',
}

type HireDoc = Awaited<ReturnType<typeof HireRequest.findOne>> & {}
type HireJson = Record<string, unknown> & {
  status: string
  business: unknown
  talent: unknown
  businessProfile?: { contactPhone?: string; websiteUrl?: string } | null
}

// Accept ke baad hi raabte ki maloomat dono taraf khulti hai:
// talent ko business ka banda, email, phone, website; business ko talent ka naam aur email.
// Us se pehle phone bhi chhupa rehta hai
async function withContacts(hires: HireDoc[], side: 'talent' | 'business') {
  const list = hires.map((hire) => hire.toJSON() as unknown as HireJson)
  const accepted = list.filter((h) => h.status === 'accepted')
  const ids = accepted.map((h) => (side === 'talent' ? h.business : h.talent))
  const users = await User.find({ _id: { $in: ids } }).select('name email')
  const byId = new Map(users.map((u) => [String(u._id), u]))
  // Talent ko: is business ko pichle talents ne kitni rating di
  const ratings = side === 'talent' ? await businessRatings(list.map((h) => h.business)) : null

  return list.map((hire) => {
    if (ratings) hire.businessRating = ratings.get(String(hire.business)) ?? null
    const phone = hire.businessProfile?.contactPhone
    if (hire.businessProfile) delete hire.businessProfile.contactPhone
    if (hire.status !== 'accepted') return hire
    const user = byId.get(String(side === 'talent' ? hire.business : hire.talent))
    if (!user) return hire
    hire.contact =
      side === 'talent'
        ? { name: user.name, email: user.email, phone, websiteUrl: hire.businessProfile?.websiteUrl }
        : { name: user.name, email: user.email }
    return hire
  })
}

async function findHire(id: string, owner: { business?: string; talent?: string }) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Hire request not found')
  const hire = await HireRequest.findOne({ _id: id, ...owner })
  if (!hire) throw new AppError(404, 'NOT_FOUND', 'Hire request not found')
  return hire
}

// POST /api/business/hires -> verified business, verified talent ko hire request bheje
export async function createHire(req: Request, res: Response) {
  const input = parseOrThrow(createHireSchema, req.body ?? {})
  const businessId = req.user!.id

  const person = await Person.findOne({ _id: input.personId, visibility: 'visible', isDraft: false })
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  // Sirf woh talent jis ne profile claim ki aur jo verified hai
  if (!person.verified || !person.claimedBy) {
    throw new AppError(403, 'TALENT_NOT_VERIFIED', 'You can only hire verified talents')
  }

  let serviceTitle: string | undefined
  if (input.serviceId) {
    const service = person.services.find((s) => String(s._id) === input.serviceId && s.isActive)
    if (!service) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', {
        serviceId: 'This service is no longer offered',
      })
    }
    serviceTitle = service.title
  }

  // Ek talent ke liye ek waqt mein ek hi khuli request
  if (await HireRequest.exists({ business: businessId, person: person._id, status: 'pending' })) {
    throw new AppError(409, 'HIRE_PENDING', 'You already sent this talent a request')
  }

  const businessProfile = await BusinessProfile.findOne({ owner: businessId }).select('companyName')
  const { personId: _personId, ...details } = input
  const hire = await HireRequest.create({
    ...details,
    business: businessId,
    businessProfile: businessProfile!._id,
    person: person._id,
    talent: person.claimedBy,
    serviceTitle,
  })

  await notifyUser(person.claimedBy, {
    type: 'hire.new',
    data: { business: businessProfile!.companyName, person: person.name },
    link: HIRES_LINK,
  })

  await hire.populate([PERSON_POPULATE, BUSINESS_POPULATE])
  const [json] = await withContacts([hire], 'business')
  sendSuccess(res, { hire: json }, 201)
}

// GET /api/business/hires -> meri bheji hui requests, naye pehle
export async function listMyHires(req: Request, res: Response) {
  const hires = await HireRequest.find({ business: req.user!.id })
    .populate(PERSON_POPULATE)
    .sort({ createdAt: -1 })
    .limit(100)
  sendSuccess(res, { hires: await withContacts(hires, 'business') })
}

// POST /api/business/hires/:id/cancel -> jawab aane se pehle wapas lo
export async function cancelHire(req: Request, res: Response) {
  const hire = await findHire(String(req.params.id), { business: req.user!.id })
  if (hire.status !== 'pending') {
    throw new AppError(409, 'INVALID_STATE', `A ${hire.status} request cannot be cancelled`)
  }
  hire.status = 'cancelled'
  await hire.save()
  await hire.populate([PERSON_POPULATE, BUSINESS_POPULATE])

  const data = hire.toObject() as unknown as {
    person?: { name?: string }
    businessProfile?: { companyName?: string }
  }
  await notifyUser(hire.talent, {
    type: 'hire.cancelled',
    data: { business: data.businessProfile?.companyName, person: data.person?.name },
    link: HIRES_LINK,
  })
  const [json] = await withContacts([hire], 'business')
  sendSuccess(res, { hire: json })
}

// GET /api/me/hire-requests -> talent ko aayi hui requests, naye pehle
export async function listIncomingHires(req: Request, res: Response) {
  const hires = await HireRequest.find({ talent: req.user!.id })
    .populate([PERSON_POPULATE, BUSINESS_POPULATE])
    .sort({ createdAt: -1 })
    .limit(100)
  sendSuccess(res, { hires: await withContacts(hires, 'talent') })
}

// PATCH /api/me/hire-requests/:id -> talent accept ya decline kare
export async function respondHire(req: Request, res: Response) {
  const { action, note } = parseOrThrow(respondHireSchema, req.body ?? {})
  const hire = await findHire(String(req.params.id), { talent: req.user!.id })
  if (hire.status !== 'pending') {
    throw new AppError(409, 'INVALID_STATE', `This request was already ${hire.status}`)
  }
  hire.set({
    status: action === 'accept' ? 'accepted' : 'declined',
    respondedAt: new Date(),
    responseNote: note || undefined,
  })
  await hire.save()
  await hire.populate([PERSON_POPULATE, BUSINESS_POPULATE])

  const person = (hire.person as unknown as { name?: string } | null)?.name
  await notifyUser(hire.business, {
    type: action === 'accept' ? 'hire.accepted' : 'hire.declined',
    data: { person },
    link: HIRES_LINK,
  })
  const [json] = await withContacts([hire], 'talent')
  sendSuccess(res, { hire: json })
}
