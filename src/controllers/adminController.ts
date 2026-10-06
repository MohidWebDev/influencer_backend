import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter } from 'mongoose'
import { Person, type IPerson } from '../models/Person'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import { adminListPeopleQuerySchema } from '../validators/adminValidator'

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// GET /api/admin/people -> saari profiles, chhupi hui bhi
export async function adminListPeople(req: Request, res: Response) {
  const query = parseOrThrow(adminListPeopleQuerySchema, req.query)
  const filter: QueryFilter<IPerson> = {}

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i')
    filter.$or = [{ name: pattern }, { slug: pattern }]
  }
  if (query.visibility) filter.visibility = query.visibility

  const skip = (query.page - 1) * query.limit
  const [people, total] = await Promise.all([
    Person.find(filter)
      .select('name slug headline photoUrl status verified visibility isDemo claimedBy totalFollowers updatedAt')
      .sort({ updatedAt: -1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    Person.countDocuments(filter),
  ])

  sendSuccess(res, { people }, 200, { page: query.page, limit: query.limit, total })
}

// GET /api/admin/people/:id -> edit form ke liye poori profile
export async function adminGetPerson(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Profile not found')

  const person = await Person.findById(id).populate([
    { path: 'professions', select: 'name slug' },
    { path: 'industries', select: 'name slug' },
    { path: 'topics', select: 'name slug' },
  ])
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')

  sendSuccess(res, { person })
}
