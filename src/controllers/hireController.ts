import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import '../types/express'
import { BusinessProfile } from '../models/BusinessProfile'
import { HireRequest } from '../models/HireRequest'
import { Person } from '../models/Person'
import { notifyUser } from '../services/notificationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import { createHireSchema, respondHireSchema } from '../validators/businessValidator'

const PERSON_POPULATE = { path: 'person', select: 'name slug headline photoUrl verified' }
const BUSINESS_POPULATE = {
  path: 'businessProfile',
  select: 'companyName websiteUrl industry country city status',
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
    link: '/dashboard',
  })

  await hire.populate([PERSON_POPULATE, BUSINESS_POPULATE])
  sendSuccess(res, { hire }, 201)
}

// GET /api/business/hires -> meri bheji hui requests, naye pehle
export async function listMyHires(req: Request, res: Response) {
  const hires = await HireRequest.find({ business: req.user!.id })
    .populate(PERSON_POPULATE)
    .sort({ createdAt: -1 })
    .limit(100)
  sendSuccess(res, { hires })
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
    link: '/dashboard',
  })
  sendSuccess(res, { hire })
}

// GET /api/me/hire-requests -> talent ko aayi hui requests, naye pehle
export async function listIncomingHires(req: Request, res: Response) {
  const hires = await HireRequest.find({ talent: req.user!.id })
    .populate([PERSON_POPULATE, BUSINESS_POPULATE])
    .sort({ createdAt: -1 })
    .limit(100)
  sendSuccess(res, { hires })
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
    link: '/dashboard',
  })
  sendSuccess(res, { hire })
}
