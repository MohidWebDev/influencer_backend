import type { Request, Response } from 'express'
import { isValidObjectId, type Types } from 'mongoose'
import '../types/express'
import { MAX_SERVICES } from '../constants/services'
import { Person, type IService } from '../models/Person'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  availabilitySchema,
  serviceSchema,
  updateServiceSchema,
} from '../validators/serviceValidator'

type PersonDoc = NonNullable<Awaited<ReturnType<typeof Person.findOne>>>

// Talent ki apni (claimed) profile. Claim ke baghair services nahi ban sakti
async function loadMyPerson(req: Request) {
  const person = await Person.findOne({ claimedBy: req.user!.id })
  if (!person) {
    throw new AppError(404, 'NO_PROFILE', 'Claim your profile first to add services')
  }
  return person
}

// "Hireable" khud: kaam ke liye khula hai aur kam se kam ek service chal rahi hai.
// Band kare to wapas "contactable". "Represented" (manager wala) ko nahi chhedte
function syncHireStatus(person: PersonDoc) {
  const offers = Boolean(person.availability?.isOpen) && person.services.some((s) => s.isActive)
  if (offers && (person.status === 'public' || person.status === 'contactable')) {
    person.status = 'hireable'
  } else if (!offers && person.status === 'hireable') {
    person.status = 'contactable'
  }
}

function payload(person: PersonDoc) {
  return {
    person: {
      _id: person._id,
      name: person.name,
      slug: person.slug,
      status: person.status,
      photoUrl: person.photoUrl,
      verified: person.verified,
    },
    services: person.services,
    availability: person.availability ?? null,
  }
}

// Mongoose ki subdocument array (id(), push, deleteOne wali)
const servicesOf = (person: PersonDoc) =>
  person.services as unknown as Types.DocumentArray<IService>

function findService(person: PersonDoc, id: string) {
  const service = isValidObjectId(id) ? servicesOf(person).id(id) : null
  if (!service) throw new AppError(404, 'NOT_FOUND', 'Service not found')
  return service
}

// GET /api/me/services -> apni services aur availability
export async function getMyServices(req: Request, res: Response) {
  sendSuccess(res, payload(await loadMyPerson(req)))
}

// POST /api/me/services
export async function createService(req: Request, res: Response) {
  const input = parseOrThrow(serviceSchema, req.body ?? {})
  const person = await loadMyPerson(req)
  if (person.services.length >= MAX_SERVICES) {
    throw new AppError(409, 'TOO_MANY_SERVICES', `You can add up to ${MAX_SERVICES} services`)
  }
  servicesOf(person).push({ ...input, deliveryDays: input.deliveryDays ?? undefined })
  syncHireStatus(person)
  await person.save()
  sendSuccess(res, { ...payload(person), service: person.services.at(-1) }, 201)
}

// PATCH /api/me/services/:id -> edit, ya sirf on/off
export async function updateService(req: Request, res: Response) {
  const input = parseOrThrow(updateServiceSchema, req.body ?? {})
  const person = await loadMyPerson(req)
  const service = findService(person, String(req.params.id))

  const { deliveryDays, ...rest } = input
  service.set(rest)
  if (deliveryDays !== undefined) service.set('deliveryDays', deliveryDays ?? undefined)
  syncHireStatus(person)
  await person.save()
  sendSuccess(res, { ...payload(person), service })
}

// DELETE /api/me/services/:id
export async function deleteService(req: Request, res: Response) {
  const person = await loadMyPerson(req)
  findService(person, String(req.params.id)).deleteOne()
  syncHireStatus(person)
  await person.save()
  sendSuccess(res, payload(person))
}

// PUT /api/me/availability
export async function updateAvailability(req: Request, res: Response) {
  const input = parseOrThrow(availabilitySchema, req.body ?? {})
  const person = await loadMyPerson(req)
  person.availability = {
    isOpen: input.isOpen,
    openTo: input.openTo,
    responseTime: input.responseTime ?? undefined,
    availableFrom: input.availableFrom ?? undefined,
    note: input.note || undefined,
    updatedAt: new Date(),
  }
  syncHireStatus(person)
  await person.save()
  sendSuccess(res, payload(person))
}
