import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter } from 'mongoose'
import '../types/express'
import {
  BUSINESS_IDENTITY_FIELDS,
  NEEDS_ACTION_BUSINESS_STATUSES,
  OPEN_BUSINESS_STATUSES,
} from '../constants/business'
import { AuditLog } from '../models/AuditLog'
import { BusinessProfile, type IBusinessProfile } from '../models/BusinessProfile'
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS } from '../models/ProfileClaim'
import { User } from '../models/User'
import { writeAuditLog } from '../services/auditService'
import { notifyAdmins, notifyUser } from '../services/notificationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { generateClaimCode, hashClaimCode, isClaimCodeValid } from '../utils/claimCode'
import { parseOrThrow } from '../utils/validation'
import {
  adminListBusinessesQuerySchema,
  businessProfileSchema,
  resetBusinessOtpSchema,
  reviewBusinessSchema,
  sendBusinessCodeSchema,
  verifyBusinessCodeSchema,
} from '../validators/businessValidator'

const OWNER_POPULATE = { path: 'owner', select: 'name email role status createdAt' }
const REVIEWER_POPULATE = [
  { path: 'reviewedBy', select: 'name email' },
  { path: 'verifiedBy', select: 'name email' },
]

type BusinessDoc = NonNullable<Awaited<ReturnType<typeof BusinessProfile.findOne>>>

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const snapshot = (business: IBusinessProfile) => ({
  status: business.status,
  companyName: business.companyName,
  otpAttempts: business.otpAttempts ?? 0,
  verificationMethod: business.verificationMethod,
  rejectionReason: business.rejectionReason,
})

// Business ka admin page
const businessLink = (business: { _id: unknown }) => `/admin/businesses/${String(business._id)}`

// Code kahan bheja ja sakta hai: login email, website, proof links, phone
async function channelsOf(business: IBusinessProfile) {
  const owner = await User.findById(business.owner).select('email')
  return [
    ...new Set(
      [owner?.email, business.websiteUrl, ...business.proofLinks, business.contactPhone].filter(
        (c): c is string => Boolean(c),
      ),
    ),
  ]
}

async function ownerName(business: IBusinessProfile) {
  const owner = await User.findById(business.owner).select('name')
  return owner?.name
}

// Shuru se: details dobara review ke liye, purana code / tasdeeq sab khatam
function restartVerification(business: BusinessDoc) {
  business.set({
    status: 'pending',
    submittedAt: new Date(),
    verification: {},
    otpAttempts: 0,
    otpLockedAt: undefined,
    lastOtpAttemptAt: undefined,
    verifiedAt: undefined,
    verifiedBy: undefined,
    verificationMethod: undefined,
    reviewedBy: undefined,
    reviewedAt: undefined,
    rejectionReason: undefined,
  })
}

// GET /api/business/profile -> meri company details aur verification ki halat (ya null)
export async function getMyBusiness(req: Request, res: Response) {
  const business = await BusinessProfile.findOne({ owner: req.user!.id })
  sendSuccess(res, { business })
}

// PUT /api/business/profile -> pehli dafa bhejo, ya theek kar ke dobara bhejo.
// Aam details (description, phone) badlen to tasdeeq wahin se chalti rehti hai;
// company ki pehchaan (naam, registration, website, mulk) badle ya reject hua ho to shuru se review
export async function saveMyBusiness(req: Request, res: Response) {
  const input = parseOrThrow(businessProfileSchema, req.body ?? {})
  const values = {
    ...input,
    companySize: input.companySize || undefined,
    contactPhone: input.contactPhone || undefined,
  }
  const existing = await BusinessProfile.findOne({ owner: req.user!.id })

  if (!existing) {
    const business = await BusinessProfile.create({ ...values, owner: req.user!.id })
    await notifyNewBusiness(business)
    return sendSuccess(res, { business }, 201)
  }

  const identityChanged = BUSINESS_IDENTITY_FIELDS.some(
    (field) => (existing[field] ?? '') !== (values[field] ?? ''),
  )
  existing.set(values)
  const restart = identityChanged || existing.status === 'rejected'
  if (restart) restartVerification(existing)
  await existing.save()
  if (restart) await notifyNewBusiness(existing)
  sendSuccess(res, { business: existing })
}

async function notifyNewBusiness(business: BusinessDoc) {
  await notifyAdmins({
    type: 'business.new',
    data: { business: business.companyName, claimant: await ownerName(business) },
    link: businessLink(business),
  })
}

function otpLockedError() {
  return new AppError(
    423,
    'OTP_LOCKED',
    'Too many wrong attempts. Your business is under review by the admin.',
    undefined,
    { attemptsLeft: 0, maxAttempts: MAX_CODE_ATTEMPTS },
  )
}

// POST /api/business/profile/verify -> business woh code (OTP) daalta hai jo admin ne bheja
export async function verifyMyBusinessCode(req: Request, res: Response) {
  const { code } = parseOrThrow(verifyBusinessCodeSchema, req.body ?? {})
  const business = await BusinessProfile.findOne({ owner: req.user!.id }).select(
    '+verification.codeHash',
  )
  if (!business) throw new AppError(404, 'NOT_FOUND', 'Add your business details first')

  if (business.status === 'otp_failed') throw otpLockedError()
  if (business.status !== 'waiting_for_business' || !business.verification.codeHash) {
    throw new AppError(409, 'NO_ACTIVE_CODE', 'There is no code to verify for this business')
  }
  if (business.verification.expiresAt && business.verification.expiresAt < new Date()) {
    throw new AppError(410, 'CODE_EXPIRED', 'This code has expired. We will send you a new one.')
  }

  const now = new Date()
  if (!isClaimCodeValid(code, business.id, business.verification.codeHash)) {
    const before = snapshot(business)
    business.otpAttempts = (business.otpAttempts ?? 0) + 1
    business.lastOtpAttemptAt = now
    const left = Math.max(MAX_CODE_ATTEMPTS - business.otpAttempts, 0)

    if (left === 0) {
      // 5vi ghalat koshish: lock, ab koi OTP qabool nahi. Admin dekhega
      business.status = 'otp_failed'
      business.otpLockedAt = now
      business.verification.codeHash = undefined
      await business.save()
      await writeAuditLog(req, {
        action: 'business.otp_locked',
        targetType: 'business',
        targetId: business._id,
        targetLabel: business.companyName,
        before,
        after: { ...snapshot(business), otpLockedAt: business.otpLockedAt },
      })
      await notifyAdmins({
        type: 'business.otp_locked',
        data: { business: business.companyName, claimant: await ownerName(business) },
        link: businessLink(business),
      })
      throw otpLockedError()
    }

    await business.save()
    throw new AppError(
      400,
      'INVALID_CODE',
      'That code is not correct',
      { code: `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` },
      { attemptsLeft: left, maxAttempts: MAX_CODE_ATTEMPTS },
    )
  }

  // Sahi code: ab admin final approve karega
  business.set({
    status: 'code_verified',
    verificationMethod: 'otp',
    verifiedAt: now,
    verifiedBy: null,
    otpAttempts: 0,
  })
  business.verification.codeHash = undefined
  await business.save()

  await notifyAdmins({
    type: 'business.code_verified',
    data: { business: business.companyName, claimant: await ownerName(business) },
    link: businessLink(business),
  })
  sendSuccess(res, { business })
}

// GET /api/admin/businesses -> verification queue (khule purane pehle)
export async function adminListBusinesses(req: Request, res: Response) {
  const query = parseOrThrow(adminListBusinessesQuerySchema, req.query)
  const filter: QueryFilter<IBusinessProfile> = {}
  const statuses =
    query.status === 'open'
      ? OPEN_BUSINESS_STATUSES
      : query.status === 'needs_action'
        ? NEEDS_ACTION_BUSINESS_STATUSES
        : query.status
          ? [query.status]
          : null
  if (statuses) filter.status = { $in: statuses }
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i')
    filter.$or = [{ companyName: pattern }, { websiteUrl: pattern }]
  }

  const isQueue = !!statuses && statuses.every((s) => OPEN_BUSINESS_STATUSES.includes(s))
  const skip = (query.page - 1) * query.limit
  const [businesses, total] = await Promise.all([
    BusinessProfile.find(filter)
      .populate(OWNER_POPULATE)
      .sort({ submittedAt: isQueue ? 1 : -1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    BusinessProfile.countDocuments(filter),
  ])
  sendSuccess(res, { businesses }, 200, { page: query.page, limit: query.limit, total })
}

async function findBusiness(id: string) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Business not found')
  const business = await BusinessProfile.findById(id).select('+verification.codeHash')
  if (!business) throw new AppError(404, 'NOT_FOUND', 'Business not found')
  return business
}

// Admin page ka jawab: details + owner + jahan code bheja ja sakta hai
async function adminPayload(business: BusinessDoc) {
  const channels = await channelsOf(business)
  await business.populate([OWNER_POPULATE, ...REVIEWER_POPULATE])
  return { business, channels }
}

// GET /api/admin/businesses/:id -> details + owner + history
export async function adminGetBusiness(req: Request, res: Response) {
  const business = await findBusiness(String(req.params.id))
  const history = await AuditLog.find({ targetType: 'business', targetId: business._id })
    .sort({ createdAt: -1 })
    .limit(50)
  sendSuccess(res, { ...(await adminPayload(business)), history })
}

// Naya code: purana bekaar, koshishein 0, lock khatam, status waiting_for_business
async function issueCode(business: BusinessDoc, channel: string) {
  // Code sirf business ke apne raabton mein se kisi pe ja sakta hai
  if (!(await channelsOf(business)).includes(channel)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', {
      channel: "Choose one of the business's contacts",
    })
  }
  const code = generateClaimCode()
  const now = new Date()
  business.set({
    status: 'waiting_for_business',
    otpAttempts: 0,
    otpLockedAt: undefined,
    lastOtpAttemptAt: undefined,
  })
  business.verification = {
    channel,
    codeHash: hashClaimCode(code, business.id),
    codeSentAt: now,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  }
  return code
}

async function notifyCodeSent(business: BusinessDoc) {
  await notifyUser(business.owner, {
    type: 'business.code_sent',
    data: { business: business.companyName, channel: business.verification.channel },
    link: '/dashboard',
  })
}

async function auditBusiness(req: Request, action: string, business: BusinessDoc, before: unknown) {
  await writeAuditLog(req, {
    action,
    targetType: 'business',
    targetId: business._id,
    targetLabel: business.companyName,
    before,
    after: snapshot(business),
  })
}

// POST /api/admin/businesses/:id/code -> naya code banao. Admin isse khud bhejega
export async function adminSendBusinessCode(req: Request, res: Response) {
  const { channel } = parseOrThrow(sendBusinessCodeSchema, req.body ?? {})
  const business = await findBusiness(String(req.params.id))

  if (!['pending', 'waiting_for_business'].includes(business.status)) {
    throw new AppError(409, 'INVALID_STATE', `A code cannot be sent for a ${business.status} business`)
  }
  const before = snapshot(business)
  const code = await issueCode(business, channel)
  await business.save()
  await auditBusiness(req, 'business.send_code', business, before)
  await notifyCodeSent(business)

  // Code sirf isi jawab mein ek dafa wapas aata hai, phir kabhi nahi
  sendSuccess(res, { ...(await adminPayload(business)), code })
}

// POST /api/admin/businesses/:id/reset-otp -> lock khol kar naya code
export async function adminResetBusinessOtp(req: Request, res: Response) {
  const input = parseOrThrow(resetBusinessOtpSchema, req.body ?? {})
  const business = await findBusiness(String(req.params.id))

  if (!['waiting_for_business', 'otp_failed'].includes(business.status)) {
    throw new AppError(409, 'INVALID_STATE', `The code cannot be reset for a ${business.status} business`)
  }
  const before = snapshot(business)
  // Raabta na diya ho to wahi jahan pichla code gaya tha
  const channel =
    input.channel ?? business.verification.channel ?? (await channelsOf(business))[0] ?? ''
  const code = await issueCode(business, channel)
  await business.save()
  await auditBusiness(req, 'business.reset_otp', business, before)
  await notifyCodeSent(business)
  sendSuccess(res, { ...(await adminPayload(business)), code })
}

async function approveBusiness(req: Request, business: BusinessDoc, before: unknown, action: string) {
  business.set({
    status: 'approved',
    reviewedBy: req.user!.id,
    reviewedAt: new Date(),
    rejectionReason: undefined,
  })
  business.verification.codeHash = undefined
  await business.save()
  await auditBusiness(req, action, business, before)
  await notifyUser(business.owner, {
    type: 'business.approved',
    data: { business: business.companyName },
    link: '/dashboard',
  })
}

// POST /api/admin/businesses/:id/verify-manual -> admin khud tasdeeq kare (OTP ke baghair)
// aur foran approve: waiting_for_business ya otp_failed se
export async function adminVerifyBusinessManually(req: Request, res: Response) {
  const business = await findBusiness(String(req.params.id))
  if (!['waiting_for_business', 'otp_failed'].includes(business.status)) {
    throw new AppError(
      409,
      'INVALID_STATE',
      `A ${business.status} business cannot be verified manually`,
    )
  }
  const before = snapshot(business)
  business.set({
    verificationMethod: 'admin_manual',
    verifiedBy: req.user!.id,
    verifiedAt: new Date(),
  })
  await approveBusiness(req, business, before, 'business.verify_manual')
  sendSuccess(res, await adminPayload(business))
}

// PATCH /api/admin/businesses/:id -> approve (sahi code ke baad) ya reject.
// Approved business ko bhi reject kiya ja sakta hai (verification wapas lena)
export async function adminReviewBusiness(req: Request, res: Response) {
  const { action, reason } = parseOrThrow(reviewBusinessSchema, req.body ?? {})
  const business = await findBusiness(String(req.params.id))
  const before = snapshot(business)

  if (action === 'approve') {
    if (business.status === 'approved') {
      throw new AppError(409, 'ALREADY_REVIEWED', 'This business is already approved')
    }
    if (business.status !== 'code_verified') {
      throw new AppError(409, 'BUSINESS_CODE_NOT_VERIFIED', 'The business has not entered the correct code yet')
    }
    await approveBusiness(req, business, before, 'business.approve')
  } else {
    if (business.status === 'rejected') {
      throw new AppError(409, 'ALREADY_REVIEWED', 'This business is already rejected')
    }
    business.set({
      status: 'rejected',
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      rejectionReason: reason || 'We could not verify your business details',
    })
    business.verification.codeHash = undefined
    await business.save()
    await auditBusiness(req, 'business.reject', business, before)
    await notifyUser(business.owner, {
      type: 'business.rejected',
      data: { business: business.companyName, reason: business.rejectionReason },
      link: '/dashboard',
    })
  }

  sendSuccess(res, await adminPayload(business))
}
