import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter } from 'mongoose'
import '../types/express'
import { Person, type IPerson } from '../models/Person'
import { PersonPhoto } from '../models/PersonPhoto'
import { ProfileClaim } from '../models/ProfileClaim'
import { ProfileRemoval } from '../models/ProfileRemoval'
import { Industry, Profession, Topic } from '../models/taxonomy'
import {
  generateUniquePersonSlug,
  resolveTaxonomySlugs,
} from '../services/personService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  adminUpdatePersonSchema,
  listPeopleQuerySchema,
  updatePersonSchema,
  type AdminUpdatePersonInput,
  type CreatePersonInput,
} from '../validators/personValidator'

const TAXONOMY_POPULATE = [
  { path: 'professions', select: 'name slug' },
  { path: 'industries', select: 'name slug' },
  { path: 'topics', select: 'name slug' },
]

// Search results ke card ke liye sirf zaroori fields
const LIST_FIELDS =
  'name slug headline photoUrl status professions country city totalFollowers verified isDemo claimedBy availability.isOpen availability.openTo'

// Claimed profile pe admin sirf ye fields badal sakta hai
const MODERATION_FIELDS = ['visibility']

const SORTS = {
  followers: { totalFollowers: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  name: { name: 1, _id: 1 },
} as const

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// GET /api/people -> search aur filters
export async function listPeople(req: Request, res: Response) {
  const query = parseOrThrow(listPeopleQuerySchema, req.query)
  const filter: QueryFilter<IPerson> = { visibility: 'visible' }

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i')
    filter.$or = [{ name: pattern }, { headline: pattern }]
  }

  // Taxonomy slugs ko ids mein badlo. Ghalat slug = koi result nahi
  const taxonomyFilters = [
    { slugs: query.profession, model: Profession, field: 'professions' },
    { slugs: query.industry, model: Industry, field: 'industries' },
    { slugs: query.topic, model: Topic, field: 'topics' },
  ] as const

  // Har qism ki shart alag banao; "any" mein inhein $or se jorte hain
  const conditions: QueryFilter<IPerson>[] = []
  let impossible = false
  for (const { slugs, model, field } of taxonomyFilters) {
    if (!slugs?.length) continue
    const ids = await model.find({ slug: { $in: slugs } }).distinct('_id')
    if (query.match === 'all') {
      // Har chuni cheez zaroori; koi slug ghalat ho to koi natija nahi
      if (ids.length < new Set(slugs).size) impossible = true
      conditions.push({ [field]: { $all: ids } })
    } else {
      conditions.push({ [field]: { $in: ids } })
    }
  }
  // Insaan ka ek hi mulk hota hai: kai mulk hamesha "in mein se koi"
  if (query.country?.length) conditions.push({ country: { $in: query.country } })

  if (impossible) conditions.push({ _id: { $in: [] } })
  if (query.match === 'any' && conditions.length > 1) {
    filter.$and = [...(filter.$and ?? []), { $or: conditions }]
  } else {
    for (const condition of conditions) Object.assign(filter, condition)
  }
  if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i')
  if (query.language) filter.languages = query.language
  if (query.minFollowers !== undefined) filter.totalFollowers = { $gte: query.minFollowers }
  if (query.status) filter.status = query.status
  if (query.openTo) {
    filter['availability.isOpen'] = true
    filter['availability.openTo'] = query.openTo
  }

  const skip = (query.page - 1) * query.limit
  const [people, total] = await Promise.all([
    Person.find(filter)
      .select(LIST_FIELDS)
      .populate({ path: 'professions', select: 'name slug' })
      .sort(SORTS[query.sort])
      .skip(skip)
      .limit(query.limit),
    Person.countDocuments(filter),
  ])

  sendSuccess(res, { people }, 200, { page: query.page, limit: query.limit, total })
}

// GET /api/people/:slug -> public profile
export async function getPersonBySlug(req: Request, res: Response) {
  const person = await Person.findOne({
    slug: String(req.params.slug).toLowerCase(),
    visibility: 'visible',
  }).populate(TAXONOMY_POPULATE)

  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  // Public ko sirf chalti (active) services
  const json = person.toJSON() as unknown as Record<string, unknown>
  json.services = person.services.filter((service) => service.isActive)
  sendSuccess(res, { person: json })
}

// GET /api/people/photos/:id -> profile photo ki file. Id har nayi photo pe badalti hai,
// is liye browser aur CDN hamesha ke liye cache kar sakte hain
export async function getPersonPhoto(req: Request, res: Response) {
  const id = String(req.params.id)
  const photo = isValidObjectId(id) ? await PersonPhoto.findById(id) : null
  if (!photo) throw new AppError(404, 'NOT_FOUND', 'Photo not found')

  res.set('Content-Type', photo.contentType)
  res.set('Cache-Control', 'public, max-age=31536000, immutable')
  res.set('CDN-Cache-Control', 'max-age=31536000')
  res.send(photo.data)
}

// POST /api/people -> sirf admin naya profile banata hai
export async function createPerson(req: Request, res: Response) {
  const input = req.body as CreatePersonInput
  // Nayi profile kisi ki claim ki hui nahi hoti, is liye verified bhi nahi ho sakti
  if (input.verified) throw notClaimedError()

  const [professions, industries, topics, slug] = await Promise.all([
    resolveTaxonomySlugs(Profession, input.professions ?? [], 'professions'),
    resolveTaxonomySlugs(Industry, input.industries ?? [], 'industries'),
    resolveTaxonomySlugs(Topic, input.topics ?? [], 'topics'),
    generateUniquePersonSlug(input.name),
  ])

  const person = await Person.create({
    ...input,
    slug,
    professions,
    industries,
    topics,
    sourceRecords: input.sourceRecords?.length
      ? input.sourceRecords
      : [{ sourceType: 'admin', note: 'Created by admin' }],
  })

  await person.populate(TAXONOMY_POPULATE)
  sendSuccess(res, { person }, 201)
}

function notClaimedError() {
  return new AppError(
    409,
    'PROFILE_NOT_CLAIMED',
    'A profile can only be verified after a talent has claimed it',
  )
}

// PATCH /api/people/:id -> admin, ya jis user ne profile claim kiya
export async function updatePerson(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Profile not found')

  const person = await Person.findById(id)
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')

  const user = req.user!
  const isAdmin = user.role === 'admin'
  const isOwner = person.claimedBy?.toString() === user.id
  if (!isAdmin && !isOwner) {
    throw new AppError(403, 'FORBIDDEN', 'You can only edit your own profile')
  }

  // Verified haath se nahi badalta: claim approve hone pe khud lagta hai
  if ('verified' in (req.body ?? {}) && Boolean(req.body.verified) !== person.verified) {
    throw new AppError(
      409,
      'AUTO_VERIFIED',
      'Verification is automatic: a profile becomes verified when its claim is approved',
    )
  }

  // Claimed profile ka maalik talent hai. Admin sirf moderation kar sakta hai
  // (verify / hide), details edit nahi
  const body = req.body ?? {}
  if (isAdmin && !isOwner && person.claimedBy) {
    const blocked = Object.keys(body).filter((key) => !MODERATION_FIELDS.includes(key))
    if (blocked.length > 0) {
      throw new AppError(
        403,
        'PROFILE_CLAIMED',
        'This profile is claimed. Only its owner can edit it. Admins can only verify or hide it.',
      )
    }
  }

  // Owner sirf apne fields badal sakta hai, admin (unclaimed profile pe) sab kuch
  const input: AdminUpdatePersonInput = isAdmin
    ? parseOrThrow(adminUpdatePersonSchema, body)
    : parseOrThrow(updatePersonSchema, body)

  // Talent ki bheji hui profile sirf claim approve hone pe public hoti hai, haath se nahi
  if (input.visibility === 'visible' && person.isDraft) {
    throw new AppError(
      409,
      'PROFILE_PENDING_REVIEW',
      'This profile is waiting for its claim to be approved',
    )
  }

  const { professions, industries, topics, ...rest } = input
  person.set(rest)
  // Nayi photo lagi to purani photo ka credit ab sahi nahi
  if (person.isModified('photoUrl')) person.photoCredit = undefined

  if (professions) {
    person.professions = await resolveTaxonomySlugs(Profession, professions, 'professions')
  }
  if (industries) {
    person.industries = await resolveTaxonomySlugs(Industry, industries, 'industries')
  }
  if (topics) {
    person.topics = await resolveTaxonomySlugs(Topic, topics, 'topics')
  }

  await person.save()
  await person.populate(TAXONOMY_POPULATE)
  sendSuccess(res, { person })
}

// DELETE /api/people/:id -> sirf admin, hamesha ke liye mita deta hai
export async function deletePerson(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Profile not found')

  const person = await Person.findByIdAndDelete(id)
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  // Is profile ke claims bhi saaf karo
  await ProfileClaim.deleteMany({ person: person._id })
  // Hatane ki request baqi thi to woh bhi poori: seed is profile ko dobara nahi banayega
  await ProfileRemoval.updateMany(
    { person: person._id, status: 'pending' },
    { $set: { status: 'removed', decidedAt: new Date(), decidedBy: req.user!.id } },
  )
  await PersonPhoto.deleteMany({ person: person._id })

  sendSuccess(res, { deleted: true, id, slug: person.slug })
}
