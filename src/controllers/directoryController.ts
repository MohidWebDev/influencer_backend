import type { Request, Response } from 'express'
import { isValidObjectId, Types, type PipelineStage } from 'mongoose'
import { z } from 'zod'
import { businessRatings } from './agreementController'
import { Agreement } from '../models/Agreement'
import { BusinessProfile } from '../models/BusinessProfile'
import { Campaign } from '../models/Campaign'
import { ManagerProfile } from '../models/ManagerProfile'
import { Representation } from '../models/Representation'
import { User } from '../models/User'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'

// Public directory: jo business / manager account bana, woh yahan dikhta hai.
// Sirf public baatein: naam, kaam, jagah, website, tasdeeq, reviews. Email, phone,
// registration number aur proof links kabhi nahi
const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
})

const reviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(4),
})

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type Kind = 'business' | 'representative'
type Rating = { average: number; count: number }

// User + us ki details (agar bhari hon). Admin ne reject / suspend kiya to bahar.
// Verified pehle, phir naye. id ho to sirf woh ek
function directoryPipeline(
  role: Kind,
  profileCollection: string,
  options: { nameFields?: string[]; q?: string; id?: string; page?: number; limit?: number },
): PipelineStage[] {
  const { nameFields = [], q, id, page = 1, limit = 1 } = options
  const search: PipelineStage[] = q
    ? [{ $match: { $or: nameFields.map((field) => ({ [field]: new RegExp(escapeRegex(q), 'i') })) } }]
    : []
  return [
    { $match: { role, status: 'active', ...(id && { _id: new Types.ObjectId(id) }) } },
    { $lookup: { from: profileCollection, localField: '_id', foreignField: 'owner', as: 'profile' } },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    { $match: { 'profile.status': { $ne: 'rejected' } } },
    ...search,
    { $addFields: { verified: { $eq: ['$profile.status', 'approved'] } } },
    { $sort: { verified: -1, createdAt: -1, _id: 1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ]
}

type Row = {
  _id: Types.ObjectId
  name: string
  createdAt: Date
  verified: boolean
  avatarUrl?: string
  company?: Record<string, unknown>
  manager?: Record<string, unknown>
  profile?: Record<string, unknown> & { status?: string }
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)

async function findRows(role: Kind, query: Parameters<typeof directoryPipeline>[2]) {
  const collection = role === 'business' ? BusinessProfile.collection.name : ManagerProfile.collection.name
  const [result] = await User.aggregate<{ items: Row[]; total: { count: number }[] }>(
    directoryPipeline(role, collection, query),
  )
  return { items: result.items, total: result.total[0]?.count ?? 0 }
}

// Ek directory entry (id se); na mile / reject / suspend ho to 404
async function findOne(role: Kind, id: string) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Not found')
  const { items } = await findRows(role, { id })
  if (!items[0]) throw new AppError(404, 'NOT_FOUND', 'Not found')
  return items[0]
}

function businessCard(row: Row, rating: Rating | undefined) {
  const p = row.profile ?? {}
  return {
    _id: row._id,
    name: text(p.companyName) ?? text(row.company?.companyName) ?? row.name,
    // Business ka apna upload kiya hua logo
    logoUrl: text(row.avatarUrl),
    organizationType: text(p.organizationType) ?? text(row.company?.organizationType),
    industry: text(p.industry) ?? text(row.company?.industry),
    companySize: text(p.companySize) ?? text(row.company?.companySize),
    description: text(p.description) ?? text(row.company?.description),
    country: text(p.country) ?? text(row.company?.country),
    city: text(p.city),
    websiteUrl: text(p.websiteUrl) ?? text(row.company?.websiteUrl),
    verified: row.verified,
    // Details bheji hain aur tasdeeq chal rahi hai
    inReview: Boolean(row.profile) && !row.verified,
    joinedAt: row.createdAt,
    // Talents ki di hui reviews (mukammal muahidon ke baad), koi na ho to null
    rating: rating ?? null,
  }
}

function managerCard(row: Row, talents: number, rating: Rating | undefined) {
  const p = row.profile ?? {}
  return {
    _id: row._id,
    name: row.name,
    photoUrl: text(row.avatarUrl),
    agencyName: text(p.agencyName) ?? text(row.manager?.agencyName),
    bio: text(p.bio),
    country: text(p.country) ?? text(row.manager?.country),
    city: text(p.city),
    websiteUrl: text(p.websiteUrl) ?? text(row.manager?.websiteUrl),
    talents,
    verified: row.verified,
    inReview: Boolean(row.profile) && !row.verified,
    joinedAt: row.createdAt,
    // Talents ki di hui reviews (manager ke kaam pe), koi na ho to null
    rating: rating ?? null,
  }
}

// Kitne talents ko is waqt represent kar rahe hain (asal, talent ki marzi se jure hue)
async function talentCounts(managerIds: Types.ObjectId[]) {
  const counts = await Representation.aggregate<{ _id: unknown; count: number }>([
    { $match: { manager: { $in: managerIds }, status: 'active' } },
    { $group: { _id: '$manager', count: { $sum: 1 } } },
  ])
  return new Map(counts.map((c) => [String(c._id), c.count]))
}

// Manager ki average rating aur ginti (talents ki reviews se)
export async function managerRatings(managerIds: Types.ObjectId[]) {
  const rows = await Representation.aggregate<{ _id: unknown; average: number; count: number }>([
    { $match: { manager: { $in: managerIds }, review: { $exists: true } } },
    { $group: { _id: '$manager', average: { $avg: '$review.rating' }, count: { $sum: 1 } } },
  ])
  return new Map(
    rows.map((r) => [String(r._id), { average: Math.round(r.average * 10) / 10, count: r.count }]),
  )
}

const meta = (query: { page: number; limit: number }, total: number) => ({
  page: query.page,
  limit: query.limit,
  total,
})

// GET /api/directory/businesses -> sign up karne wale saare businesses
export async function listBusinesses(req: Request, res: Response) {
  const query = parseOrThrow(querySchema, req.query)
  const { items, total } = await findRows('business', {
    ...query,
    nameFields: ['name', 'company.companyName', 'profile.companyName'],
  })
  const ratings = await businessRatings(items.map((row) => row._id))
  const businesses = items.map((row) => businessCard(row, ratings.get(String(row._id))))
  sendSuccess(res, { businesses }, 200, meta(query, total))
}

// GET /api/directory/managers -> sign up karne wale saare managers / agents
export async function listManagers(req: Request, res: Response) {
  const query = parseOrThrow(querySchema, req.query)
  const { items, total } = await findRows('representative', {
    ...query,
    nameFields: ['name', 'manager.agencyName', 'profile.agencyName'],
  })
  const ids = items.map((row) => row._id)
  const [counts, ratings] = await Promise.all([talentCounts(ids), managerRatings(ids)])
  const managers = items.map((row) =>
    managerCard(row, counts.get(String(row._id)) ?? 0, ratings.get(String(row._id))),
  )
  sendSuccess(res, { managers }, 200, meta(query, total))
}

// GET /api/directory/businesses/:id -> ek business ki public tafseel + khuli campaigns
export async function getBusiness(req: Request, res: Response) {
  const row = await findOne('business', String(req.params.id))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [ratings, campaigns, completedWork] = await Promise.all([
    businessRatings([row._id]),
    Campaign.find({
      owner: row._id,
      status: 'open',
      $or: [{ deadline: null }, { deadline: { $gte: today } }],
    })
      .select('title category budget country deadline slots publishedAt')
      .sort({ publishedAt: -1 })
      .limit(6),
    Agreement.countDocuments({ business: row._id, status: 'completed' }),
  ])
  sendSuccess(res, {
    business: { ...businessCard(row, ratings.get(String(row._id))), completedWork },
    campaigns,
  })
}

// GET /api/directory/managers/:id -> ek manager ki public tafseel + jin talents ko represent karta hai
export async function getManager(req: Request, res: Response) {
  const row = await findOne('representative', String(req.params.id))
  const [counts, ratings, reps] = await Promise.all([
    talentCounts([row._id]),
    managerRatings([row._id]),
    Representation.find({ manager: row._id, status: 'active' })
      .populate({
        path: 'person',
        select: 'name slug headline photoUrl verified totalFollowers country city visibility isDraft',
      })
      .limit(24),
  ])
  // Sirf public profiles
  const talents = reps
    .map((rep) => rep.person as unknown as { visibility?: string; isDraft?: boolean } | null)
    .filter((person) => person && person.visibility === 'visible' && !person.isDraft)
  const p = row.profile ?? {}
  const socialAccounts = Array.isArray(p.socialAccounts)
    ? (p.socialAccounts as { platform: string; url: string }[]).map(({ platform, url }) => ({ platform, url }))
    : []
  sendSuccess(res, {
    manager: {
      ...managerCard(row, counts.get(String(row._id)) ?? 0, ratings.get(String(row._id))),
      socialAccounts,
    },
    talents,
  })
}

// GET /api/directory/businesses/:id/reviews -> talents ne is business ke saath kaam ke baad kya kaha
export async function listBusinessReviews(req: Request, res: Response) {
  const query = parseOrThrow(reviewsQuerySchema, req.query)
  const row = await findOne('business', String(req.params.id))
  const filter = { business: row._id, status: 'completed' as const, 'reviews.talent': { $exists: true } }
  const [agreements, ratings] = await Promise.all([
    Agreement.find(filter)
      .select('reviews.talent person')
      .populate({ path: 'person', select: 'name slug photoUrl' })
      .sort({ 'reviews.talent.createdAt': -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    businessRatings([row._id]),
  ])
  const reviews = agreements.map((a) => {
    const person = a.person as unknown as { name?: string; slug?: string; photoUrl?: string } | null
    return {
      _id: a._id,
      rating: a.reviews.talent!.rating,
      comment: a.reviews.talent!.comment,
      createdAt: a.reviews.talent!.createdAt,
      reviewer: person?.name,
      reviewerSlug: person?.slug,
      reviewerPhoto: person?.photoUrl,
    }
  })
  const rating = ratings.get(String(row._id)) ?? { average: null, count: 0 }
  sendSuccess(res, { rating, reviews }, 200, meta(query, rating.count))
}

// GET /api/directory/managers/:id/reviews -> talents ne apne manager ke baare mein kya kaha
export async function listManagerReviews(req: Request, res: Response) {
  const query = parseOrThrow(reviewsQuerySchema, req.query)
  const row = await findOne('representative', String(req.params.id))
  const [reps, ratings] = await Promise.all([
    Representation.find({ manager: row._id, review: { $exists: true } })
      .select('review person')
      .populate({ path: 'person', select: 'name slug photoUrl' })
      .sort({ 'review.createdAt': -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    managerRatings([row._id]),
  ])
  const reviews = reps.map((rep) => {
    const person = rep.person as unknown as { name?: string; slug?: string; photoUrl?: string } | null
    return {
      _id: rep._id,
      rating: rep.review!.rating,
      comment: rep.review!.comment,
      createdAt: rep.review!.createdAt,
      reviewer: person?.name,
      reviewerSlug: person?.slug,
      reviewerPhoto: person?.photoUrl,
    }
  })
  const rating = ratings.get(String(row._id)) ?? { average: null, count: 0 }
  sendSuccess(res, { rating, reviews }, 200, meta(query, rating.count))
}
