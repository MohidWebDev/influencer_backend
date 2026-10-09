import type { Request, Response } from 'express'
import { isValidObjectId, type Types } from 'mongoose'
import '../types/express'
import { Agreement } from '../models/Agreement'
import { HireRequest } from '../models/HireRequest'
import { Person } from '../models/Person'
import { MAX_SHORTLIST_ITEMS, MAX_SHORTLISTS, Shortlist } from '../models/Shortlist'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  addItemSchema,
  createShortlistSchema,
  updateItemSchema,
  updateShortlistSchema,
} from '../validators/shortlistValidator'
import { personRatings } from './agreementController'

// Compare / list ke liye shakhs ki zaroori baatein
const PERSON_FIELDS =
  'name slug headline photoUrl verified claimedBy status country city totalFollowers professions socialAccounts services availability visibility isDraft'

type ShortlistDoc = NonNullable<Awaited<ReturnType<typeof Shortlist.findOne>>>

async function findMine(req: Request) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Shortlist not found')
  const list = await Shortlist.findOne({ _id: id, owner: req.user!.id })
  if (!list) throw new AppError(404, 'NOT_FOUND', 'Shortlist not found')
  return list
}

// Naam pehle se ho to saaf error (unique index ka MongoDB error nahi)
async function assertNameFree(ownerId: string, name: string, exceptId?: unknown) {
  const taken = await Shortlist.findOne({
    owner: ownerId,
    name,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).collation({ locale: 'en', strength: 2 })
  if (taken) {
    throw new AppError(409, 'SHORTLIST_EXISTS', 'You already have a list with this name', {
      name: 'You already have a list with this name',
    })
  }
}

// List ka chhota khulasa: kitne log aur pehle 4 ki tasveer (lists wale page ke liye)
async function summaries(lists: ShortlistDoc[]) {
  const previewIds = lists.flatMap((list) => list.items.slice(0, 4).map((item) => item.person))
  const people = await Person.find({ _id: { $in: previewIds } }).select('name photoUrl')
  const byId = new Map(people.map((p) => [String(p._id), p]))
  return lists.map((list) => ({
    _id: list._id,
    name: list.name,
    description: list.description,
    count: list.items.length,
    preview: list.items
      .slice(0, 4)
      .map((item) => byId.get(String(item.person)))
      .filter(Boolean)
      .map((p) => ({ _id: p!._id, name: p!.name, photoUrl: p!.photoUrl })),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  }))
}

// Har shakhs ke saath: business ki taraf se hire ki taaza halat (request / muahida)
async function hiringStatus(ownerId: string, personIds: Types.ObjectId[]) {
  const hires = await HireRequest.find({ business: ownerId, person: { $in: personIds } })
    .select('person status agreement createdAt')
    .sort({ createdAt: -1 })
  const latest = new Map<string, (typeof hires)[number]>()
  for (const hire of hires) {
    if (!latest.has(String(hire.person))) latest.set(String(hire.person), hire)
  }
  const agreementIds = [...latest.values()].map((h) => h.agreement).filter(Boolean)
  const agreements = await Agreement.find({ _id: { $in: agreementIds } }).select('status')
  const agreementStatus = new Map(agreements.map((a) => [String(a._id), a.status]))

  return new Map(
    [...latest.entries()].map(([personId, hire]) => [
      personId,
      {
        hireId: hire._id,
        hireStatus: hire.status,
        agreementId: hire.agreement ?? null,
        agreementStatus: hire.agreement ? (agreementStatus.get(String(hire.agreement)) ?? null) : null,
      },
    ]),
  )
}

// Poori list: har shakhs ki maloomat, note, rating aur hire ki halat
async function detail(list: ShortlistDoc, ownerId: string) {
  const ids = list.items.map((item) => item.person)
  const [people, ratings, hiring] = await Promise.all([
    Person.find({ _id: { $in: ids } })
      .select(PERSON_FIELDS)
      .populate({ path: 'professions', select: 'name slug' }),
    personRatings(ids),
    hiringStatus(ownerId, ids),
  ])
  const byId = new Map(people.map((p) => [String(p._id), p]))

  const items = list.items.map((item) => {
    const key = String(item.person)
    const person = byId.get(key)
    // Profile mit gayi ya chhup gayi: list mein rehti hai, bas "ab maujood nahi"
    const available = !!person && person.visibility === 'visible' && !person.isDraft
    return {
      personId: item.person,
      note: item.note ?? '',
      addedAt: item.addedAt,
      available,
      person: available
        ? {
            _id: person._id,
            name: person.name,
            slug: person.slug,
            headline: person.headline,
            photoUrl: person.photoUrl,
            verified: person.verified,
            claimed: !!person.claimedBy,
            status: person.status,
            country: person.country,
            city: person.city,
            totalFollowers: person.totalFollowers,
            professions: person.professions,
            socialAccounts: person.socialAccounts.map((a) => ({
              platform: a.platform,
              followers: a.followers,
            })),
            services: person.services
              .filter((s) => s.isActive)
              .map((s) => ({ _id: s._id, title: s.title, category: s.category, pricing: s.pricing })),
            availability: person.availability ?? null,
          }
        : person
          ? { _id: person._id, name: person.name }
          : null,
      rating: ratings.get(key) ?? null,
      hiring: hiring.get(key) ?? null,
    }
  })

  return {
    _id: list._id,
    name: list.name,
    description: list.description,
    items,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  }
}

// GET /api/shortlists -> meri saari lists (naye badle pehle)
export async function listShortlists(req: Request, res: Response) {
  const lists = await Shortlist.find({ owner: req.user!.id }).sort({ updatedAt: -1 })
  sendSuccess(res, { shortlists: await summaries(lists) })
}

// GET /api/shortlists/saved -> har profile kin lists mein hai (star ke liye)
export async function savedMembership(req: Request, res: Response) {
  const lists = await Shortlist.find({ owner: req.user!.id }).select('name items.person').sort({ name: 1 })
  const saved: Record<string, string[]> = {}
  for (const list of lists) {
    for (const item of list.items) {
      const key = String(item.person)
      ;(saved[key] ??= []).push(String(list._id))
    }
  }
  sendSuccess(res, { lists: lists.map((l) => ({ _id: l._id, name: l.name })), saved })
}

// POST /api/shortlists
export async function createShortlist(req: Request, res: Response) {
  const input = parseOrThrow(createShortlistSchema, req.body ?? {})
  const owner = req.user!.id
  if ((await Shortlist.countDocuments({ owner })) >= MAX_SHORTLISTS) {
    throw new AppError(409, 'TOO_MANY_SHORTLISTS', `You can have up to ${MAX_SHORTLISTS} lists`)
  }
  await assertNameFree(owner, input.name)
  const list = await Shortlist.create({ owner, name: input.name, description: input.description || undefined })
  sendSuccess(res, { shortlist: await detail(list, owner) }, 201)
}

// GET /api/shortlists/:id
export async function getShortlist(req: Request, res: Response) {
  const list = await findMine(req)
  sendSuccess(res, { shortlist: await detail(list, req.user!.id) })
}

// PATCH /api/shortlists/:id -> naam / tafseel badlo
export async function updateShortlist(req: Request, res: Response) {
  const input = parseOrThrow(updateShortlistSchema, req.body ?? {})
  const list = await findMine(req)
  if (input.name !== undefined) {
    await assertNameFree(req.user!.id, input.name, list._id)
    list.name = input.name
  }
  if (input.description !== undefined) list.description = input.description || undefined
  await list.save()
  sendSuccess(res, { shortlist: await detail(list, req.user!.id) })
}

// DELETE /api/shortlists/:id
export async function deleteShortlist(req: Request, res: Response) {
  const list = await findMine(req)
  await list.deleteOne()
  sendSuccess(res, { deleted: true })
}

// POST /api/shortlists/:id/items -> list mein shakhs daalo (pehle se ho to sirf note badle)
export async function addShortlistItem(req: Request, res: Response) {
  const { personId, note } = parseOrThrow(addItemSchema, req.body ?? {})
  const list = await findMine(req)
  const person = await Person.exists({ _id: personId, visibility: 'visible', isDraft: false })
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')

  const existing = list.items.find((item) => String(item.person) === personId)
  if (existing) {
    if (note !== undefined) existing.note = note || undefined
  } else {
    if (list.items.length >= MAX_SHORTLIST_ITEMS) {
      throw new AppError(409, 'SHORTLIST_FULL', `A list can hold up to ${MAX_SHORTLIST_ITEMS} people`)
    }
    list.items.push({ person: person._id, note: note || undefined, addedAt: new Date() })
  }
  await list.save()
  sendSuccess(res, { shortlist: await detail(list, req.user!.id) }, existing ? 200 : 201)
}

// PATCH /api/shortlists/:id/items/:personId -> private note
export async function updateShortlistItem(req: Request, res: Response) {
  const { note } = parseOrThrow(updateItemSchema, req.body ?? {})
  const list = await findMine(req)
  const item = list.items.find((i) => String(i.person) === String(req.params.personId))
  if (!item) throw new AppError(404, 'NOT_FOUND', 'This person is not in the list')
  item.note = note || undefined
  await list.save()
  sendSuccess(res, { shortlist: await detail(list, req.user!.id) })
}

// DELETE /api/shortlists/:id/items/:personId
export async function removeShortlistItem(req: Request, res: Response) {
  const list = await findMine(req)
  const before = list.items.length
  list.items = list.items.filter((i) => String(i.person) !== String(req.params.personId))
  if (list.items.length === before) {
    throw new AppError(404, 'NOT_FOUND', 'This person is not in the list')
  }
  await list.save()
  sendSuccess(res, { shortlist: await detail(list, req.user!.id) })
}
