import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import '../types/express'
import { Person } from '../models/Person'
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  OPEN_CLAIM_STATUSES,
  ProfileClaim,
  type ClaimStatus,
} from '../models/ProfileClaim'
import { setPersonOwner } from '../services/personService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { generateClaimCode, hashClaimCode, isClaimCodeValid } from '../utils/claimCode'
import { parseOrThrow } from '../utils/validation'
import {
  adminListClaimsQuerySchema,
  reviewClaimSchema,
  sendCodeSchema,
  verifyCodeSchema,
  type CreateClaimInput,
} from '../validators/claimValidator'

const PERSON_FIELDS = 'name slug headline photoUrl claimedBy'
const CLAIM_POPULATE = [
  { path: 'person', select: PERSON_FIELDS },
  { path: 'user', select: 'name email role' },
]

async function findClaimOr404(id: string) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Claim not found')
  const claim = await ProfileClaim.findById(id).select('+verification.codeHash')
  if (!claim) throw new AppError(404, 'NOT_FOUND', 'Claim not found')
  return claim
}

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
  // Ek waqt mein ek hi khula claim
  if (await ProfileClaim.exists({ user: userId, status: { $in: OPEN_CLAIM_STATUSES } })) {
    throw new AppError(409, 'CLAIM_PENDING', 'You already have a claim waiting for review')
  }

  const claim = await ProfileClaim.create({
    person: person._id,
    user: userId,
    evidence: {
      contactEmail: input.contactEmail || undefined,
      links: input.links,
      note: input.note || undefined,
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

// POST /api/claims/:id/verify -> talent woh code daalta hai jo admin ne DM kiya
export async function verifyClaimCode(req: Request, res: Response) {
  const { code } = parseOrThrow(verifyCodeSchema, req.body ?? {})
  const claim = await findClaimOr404(String(req.params.id))

  // Sirf apna claim
  if (claim.user.toString() !== req.user!.id) {
    throw new AppError(404, 'NOT_FOUND', 'Claim not found')
  }
  if (claim.status !== 'code_sent' || !claim.verification.codeHash) {
    throw new AppError(409, 'NO_ACTIVE_CODE', 'There is no code to verify for this claim')
  }
  if (claim.verification.expiresAt && claim.verification.expiresAt < new Date()) {
    throw new AppError(410, 'CODE_EXPIRED', 'This code has expired. We will send you a new one.')
  }
  if (claim.verification.attempts >= MAX_CODE_ATTEMPTS) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong attempts. We will send you a new code.')
  }

  if (!isClaimCodeValid(code, claim.id, claim.verification.codeHash)) {
    claim.verification.attempts += 1
    await claim.save()
    const left = MAX_CODE_ATTEMPTS - claim.verification.attempts
    throw new AppError(400, 'INVALID_CODE', 'That code is not correct', {
      code: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Wrong code. No attempts left.',
    })
  }

  // Sahi code: ab admin final approve karega
  claim.status = 'code_verified'
  claim.verification.verifiedAt = new Date()
  claim.verification.codeHash = undefined
  await claim.save()

  await claim.populate({ path: 'person', select: PERSON_FIELDS })
  sendSuccess(res, { claim })
}

// GET /api/admin/claims?status=open -> admin ke liye list
export async function adminListClaims(req: Request, res: Response) {
  const query = parseOrThrow(adminListClaimsQuerySchema, req.query)
  const statuses: ClaimStatus[] =
    query.status === 'open'
      ? OPEN_CLAIM_STATUSES
      : query.status === 'needs_action'
        ? ['pending', 'code_verified']
        : [query.status]
  const filter = { status: { $in: statuses } }
  const isOpen = statuses.every((s) => OPEN_CLAIM_STATUSES.includes(s))
  const skip = (query.page - 1) * query.limit

  const [claims, total] = await Promise.all([
    ProfileClaim.find(filter)
      .populate(CLAIM_POPULATE)
      // Khule claims purane pehle (pehle aao pehle pao), band claims naye pehle
      .sort({ createdAt: isOpen ? 1 : -1 })
      .skip(skip)
      .limit(query.limit),
    ProfileClaim.countDocuments(filter),
  ])

  sendSuccess(res, { claims }, 200, { page: query.page, limit: query.limit, total })
}

// POST /api/admin/claims/:id/code -> naya code banao. Admin isse khud DM karega
export async function adminSendClaimCode(req: Request, res: Response) {
  const { channelUrl } = parseOrThrow(sendCodeSchema, req.body ?? {})
  const claim = await findClaimOr404(String(req.params.id))

  if (!['pending', 'code_sent'].includes(claim.status)) {
    throw new AppError(409, 'INVALID_STATE', `A code cannot be sent for a ${claim.status} claim`)
  }
  // Code sirf talent ke diye hue links mein se kisi pe ja sakta hai
  if (!claim.evidence.links.includes(channelUrl)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', {
      channelUrl: 'Choose one of the links the talent provided',
    })
  }

  const code = generateClaimCode()
  const now = new Date()
  claim.status = 'code_sent'
  claim.verification = {
    channelUrl,
    codeHash: hashClaimCode(code, claim.id),
    codeSentAt: now,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    attempts: 0,
  }
  await claim.save()
  await claim.populate(CLAIM_POPULATE)

  // Code sirf isi jawab mein ek dafa wapas aata hai, phir kabhi nahi
  sendSuccess(res, { claim, code })
}

// PATCH /api/admin/claims/:id -> approve (code verify hone ke baad) ya reject
export async function adminReviewClaim(req: Request, res: Response) {
  const { action, reason } = parseOrThrow(reviewClaimSchema, req.body ?? {})
  const claim = await findClaimOr404(String(req.params.id))

  if (!OPEN_CLAIM_STATUSES.includes(claim.status)) {
    throw new AppError(409, 'ALREADY_REVIEWED', `This claim was already ${claim.status}`)
  }

  const reviewedBy = req.user!.id
  const reviewedAt = new Date()

  if (action === 'approve') {
    if (claim.status !== 'code_verified') {
      throw new AppError(409, 'CODE_NOT_VERIFIED', 'The talent has not entered the correct code yet')
    }
    // Person ka maalik "people" service ke zariye set hota hai (document ka rule)
    await setPersonOwner(claim.person, claim.user)
    claim.set({ status: 'approved', reviewedBy, reviewedAt })
    await claim.save()

    // Isi profile ke baqi khule claims khud reject
    await ProfileClaim.updateMany(
      { person: claim.person, status: { $in: OPEN_CLAIM_STATUSES }, _id: { $ne: claim._id } },
      {
        $set: {
          status: 'rejected',
          reviewedBy,
          reviewedAt,
          rejectionReason: 'Another claim for this profile was approved',
        },
        $unset: { 'verification.codeHash': 1 },
      },
    )
  } else {
    claim.set({
      status: 'rejected',
      reviewedBy,
      reviewedAt,
      rejectionReason: reason || 'We could not verify that this profile belongs to you',
    })
    claim.verification.codeHash = undefined
    await claim.save()
  }

  await claim.populate(CLAIM_POPULATE)
  sendSuccess(res, { claim })
}
