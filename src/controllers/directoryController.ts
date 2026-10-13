import type { Request, Response } from 'express'
import type { PipelineStage } from 'mongoose'
import { z } from 'zod'
import { BusinessProfile } from '../models/BusinessProfile'
import { ManagerProfile } from '../models/ManagerProfile'
import { Representation } from '../models/Representation'
import { User } from '../models/User'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'

// Public directory: jo business / manager account bana, woh yahan dikhta hai.
// Sirf public baatein: naam, kaam, jagah, website, tasdeeq. Email, phone,
// registration number aur proof links kabhi nahi
const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
})

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// User + us ki details (agar bhari hon). Admin ne reject / suspend kiya to list se bahar.
// Verified pehle, phir naye
function directoryPipeline(
  role: 'business' | 'representative',
  profileCollection: string,
  nameFields: string[],
  query: z.infer<typeof querySchema>,
): PipelineStage[] {
  const match: PipelineStage[] = query.q
    ? [
        {
          $match: {
            $or: nameFields.map((field) => ({ [field]: new RegExp(escapeRegex(query.q!), 'i') })),
          },
        },
      ]
    : []
  return [
    { $match: { role, status: 'active' } },
    { $lookup: { from: profileCollection, localField: '_id', foreignField: 'owner', as: 'profile' } },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    { $match: { 'profile.status': { $ne: 'rejected' } } },
    ...match,
    { $addFields: { verified: { $eq: ['$profile.status', 'approved'] } } },
    { $sort: { verified: -1, createdAt: -1, _id: 1 } },
    {
      $facet: {
        items: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
        total: [{ $count: 'count' }],
      },
    },
  ]
}

type Row = {
  _id: unknown
  name: string
  createdAt: Date
  verified: boolean
  company?: Record<string, unknown>
  manager?: Record<string, unknown>
  profile?: Record<string, unknown> & { status?: string }
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)

// GET /api/directory/businesses -> sign up karne wale saare businesses
export async function listBusinesses(req: Request, res: Response) {
  const query = parseOrThrow(querySchema, req.query)
  const [result] = await User.aggregate<{ items: Row[]; total: { count: number }[] }>(
    directoryPipeline('business', BusinessProfile.collection.name, ['name', 'company.companyName', 'profile.companyName'], query),
  )
  const businesses = result.items.map((row) => {
    const p = row.profile ?? {}
    return {
      _id: row._id,
      name: text(p.companyName) ?? text(row.company?.companyName) ?? row.name,
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
    }
  })
  sendSuccess(res, { businesses }, 200, {
    page: query.page,
    limit: query.limit,
    total: result.total[0]?.count ?? 0,
  })
}

// GET /api/directory/managers -> sign up karne wale saare managers / agents
export async function listManagers(req: Request, res: Response) {
  const query = parseOrThrow(querySchema, req.query)
  const [result] = await User.aggregate<{ items: Row[]; total: { count: number }[] }>(
    directoryPipeline('representative', ManagerProfile.collection.name, ['name', 'manager.agencyName', 'profile.agencyName'], query),
  )
  // Kitne talents ko is waqt represent kar rahe hain (asal, talent ki marzi se jure hue)
  const ids = result.items.map((row) => row._id)
  const counts = await Representation.aggregate<{ _id: unknown; count: number }>([
    { $match: { manager: { $in: ids }, status: 'active' } },
    { $group: { _id: '$manager', count: { $sum: 1 } } },
  ])
  const countOf = new Map(counts.map((c) => [String(c._id), c.count]))

  const managers = result.items.map((row) => {
    const p = row.profile ?? {}
    return {
      _id: row._id,
      name: row.name,
      agencyName: text(p.agencyName) ?? text(row.manager?.agencyName),
      bio: text(p.bio),
      country: text(p.country) ?? text(row.manager?.country),
      city: text(p.city),
      websiteUrl: text(p.websiteUrl) ?? text(row.manager?.websiteUrl),
      talents: countOf.get(String(row._id)) ?? 0,
      verified: row.verified,
      inReview: Boolean(row.profile) && !row.verified,
      joinedAt: row.createdAt,
    }
  })
  sendSuccess(res, { managers }, 200, {
    page: query.page,
    limit: query.limit,
    total: result.total[0]?.count ?? 0,
  })
}
