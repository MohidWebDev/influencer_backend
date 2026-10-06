import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import '../types/express'
import { Person } from '../models/Person'
import { ProfileClaim } from '../models/ProfileClaim'
import { setPersonOwner } from '../services/personService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  adminListClaimsQuerySchema,
  reviewClaimSchema,
  type CreateClaimInput,
} from '../validators/claimValidator'

const PERSON_FIELDS = 'name slug headline photoUrl claimedBy'

// POST /api/claims -> talent kehta hai "ye profile meri hai"
export async function createClaim(req: Request, res: Response) {
  const input = req.body as CreateClaimInput
  const userId = req.user!.id

  const person = await Person.findOne({ _id: input.personId, visibility: 'visible' })
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  if (person.claimedBy) {
    throw new AppError(409, 'ALREADY_CLAIMED', 'This profile has already been claimed')
  }

  // Ek talent ki ek hi profile ho sakti hai
  if (await Person.exists({ claimedBy: userId })) {
    throw new AppError(409, 'ALREADY_OWNS_PROFILE', 'You already own a profile')
  }
  // Ek waqt mein ek hi pending claim
  if (await ProfileClaim.exists({ user: userId, status: 'pending' })) {
    throw new AppError(409, 'CLAIM_PENDING', 'You already have a claim waiting for review')
  }

  const claim = await ProfileClaim.create({
    person: person._id,
    user: userId,
    evidence: {
      contactEmail: input.contactEmail || undefined,
      links: input.links,
      note: input.note,
    },
  })

  await claim.populate({ path: 'person', select: PERSON_FIELDS })
  sendSuccess(res, { claim }, 201)
}

// GET /api/claims/mine -> mere claims (naye pehle)
export async function listMyClaims(req: Request, res: Response) {
  const claims = await ProfileClaim.find({ user: req.user!.id })
    .populate({ path: 'person', select: PERSON_FIELDS })
    .sort({ createdAt: -1 })
    .limit(20)
  sendSuccess(res, { claims })
}

// GET /api/claims/my-profile -> jo profile mere naam hai (ya null)
export async function getMyProfile(req: Request, res: Response) {
  const person = await Person.findOne({ claimedBy: req.user!.id }).populate([
    { path: 'professions', select: 'name slug' },
    { path: 'industries', select: 'name slug' },
    { path: 'topics', select: 'name slug' },
  ])
  sendSuccess(res, { person })
}

// GET /api/admin/claims?status=pending -> admin ke liye list
export async function adminListClaims(req: Request, res: Response) {
  const query = parseOrThrow(adminListClaimsQuerySchema, req.query)
  const filter = { status: query.status }
  const skip = (query.page - 1) * query.limit

  const [claims, total] = await Promise.all([
    ProfileClaim.find(filter)
      .populate({ path: 'person', select: PERSON_FIELDS })
      .populate({ path: 'user', select: 'name email role' })
      .sort({ createdAt: query.status === 'pending' ? 1 : -1 })
      .skip(skip)
      .limit(query.limit),
    ProfileClaim.countDocuments(filter),
  ])

  sendSuccess(res, { claims }, 200, { page: query.page, limit: query.limit, total })
}

// PATCH /api/admin/claims/:id -> approve ya reject
export async function adminReviewClaim(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Claim not found')

  const { action, reason } = parseOrThrow(reviewClaimSchema, req.body ?? {})
  const claim = await ProfileClaim.findById(id)
  if (!claim) throw new AppError(404, 'NOT_FOUND', 'Claim not found')
  if (claim.status !== 'pending') {
    throw new AppError(409, 'ALREADY_REVIEWED', `This claim was already ${claim.status}`)
  }

  const reviewedBy = req.user!.id
  const reviewedAt = new Date()

  if (action === 'approve') {
    // Person ka maalik "people" service ke zariye set hota hai (document ka rule)
    await setPersonOwner(claim.person, claim.user)
    claim.set({ status: 'approved', reviewedBy, reviewedAt })
    await claim.save()

    // Isi profile ke baqi pending claims khud reject
    await ProfileClaim.updateMany(
      { person: claim.person, status: 'pending', _id: { $ne: claim._id } },
      {
        $set: {
          status: 'rejected',
          reviewedBy,
          reviewedAt,
          rejectionReason: 'Another claim for this profile was approved',
        },
      },
    )
  } else {
    claim.set({
      status: 'rejected',
      reviewedBy,
      reviewedAt,
      rejectionReason: reason || 'We could not verify that this profile belongs to you',
    })
    await claim.save()
  }

  await claim.populate([
    { path: 'person', select: PERSON_FIELDS },
    { path: 'user', select: 'name email role' },
  ])
  sendSuccess(res, { claim })
}
