import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter } from 'mongoose'
import '../types/express'
import { BUSINESS_IDENTITY_FIELDS } from '../constants/business'
import { AuditLog } from '../models/AuditLog'
import { BusinessProfile, type IBusinessProfile } from '../models/BusinessProfile'
import { User } from '../models/User'
import { writeAuditLog } from '../services/auditService'
import { notifyAdmins, notifyUser } from '../services/notificationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  adminListBusinessesQuerySchema,
  businessProfileSchema,
  reviewBusinessSchema,
} from '../validators/businessValidator'

const OWNER_POPULATE = { path: 'owner', select: 'name email role status createdAt' }
const REVIEWER_POPULATE = { path: 'reviewedBy', select: 'name email' }

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const snapshot = (business: IBusinessProfile) => ({
  status: business.status,
  companyName: business.companyName,
  rejectionReason: business.rejectionReason,
})

// GET /api/business/profile -> meri company details aur verification ki halat (ya null)
export async function getMyBusiness(req: Request, res: Response) {
  const business = await BusinessProfile.findOne({ owner: req.user!.id })
  sendSuccess(res, { business })
}

// PUT /api/business/profile -> pehli dafa bhejo, ya theek kar ke dobara bhejo.
// Approved business sirf aam details (description, phone) badle to verified rehta hai;
// company ki pehchaan (naam, registration, website, mulk) badle to dobara review
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
    await notifyNewBusiness(req, business.id, business.companyName)
    return sendSuccess(res, { business }, 201)
  }

  const identityChanged = BUSINESS_IDENTITY_FIELDS.some(
    (field) => (existing[field] ?? '') !== (values[field] ?? ''),
  )
  existing.set(values)
  // Pending / rejected pe har save dobara review ke liye; approved pe sirf pehchaan badle to
  const resubmit = existing.status !== 'approved' || identityChanged
  if (resubmit) {
    existing.set({
      status: 'pending',
      submittedAt: new Date(),
      reviewedBy: undefined,
      reviewedAt: undefined,
      rejectionReason: undefined,
    })
  }
  await existing.save()
  if (resubmit) await notifyNewBusiness(req, existing.id, existing.companyName)
  sendSuccess(res, { business: existing })
}

async function notifyNewBusiness(req: Request, id: string, companyName: string) {
  const owner = await User.findById(req.user!.id).select('name')
  await notifyAdmins({
    type: 'business.new',
    data: { business: companyName, claimant: owner?.name },
    link: `/admin/businesses/${id}`,
  })
}

// GET /api/admin/businesses -> verification queue (pending purane pehle)
export async function adminListBusinesses(req: Request, res: Response) {
  const query = parseOrThrow(adminListBusinessesQuerySchema, req.query)
  const filter: QueryFilter<IBusinessProfile> = {}
  if (query.status) filter.status = query.status
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i')
    filter.$or = [{ companyName: pattern }, { websiteUrl: pattern }]
  }

  const isQueue = query.status === 'pending'
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
  const business = await BusinessProfile.findById(id)
  if (!business) throw new AppError(404, 'NOT_FOUND', 'Business not found')
  return business
}

// GET /api/admin/businesses/:id -> details + owner + history
export async function adminGetBusiness(req: Request, res: Response) {
  const business = await findBusiness(String(req.params.id))
  await business.populate([OWNER_POPULATE, REVIEWER_POPULATE])
  const history = await AuditLog.find({ targetType: 'business', targetId: business._id })
    .sort({ createdAt: -1 })
    .limit(50)
  sendSuccess(res, { business, history })
}

// PATCH /api/admin/businesses/:id -> approve / reject. Pending se dono; approved ko reject
// (verification wapas lena) aur rejected ko approve bhi ho sakta hai
export async function adminReviewBusiness(req: Request, res: Response) {
  const { action, reason } = parseOrThrow(reviewBusinessSchema, req.body ?? {})
  const business = await findBusiness(String(req.params.id))
  const next = action === 'approve' ? 'approved' : 'rejected'
  if (business.status === next) {
    throw new AppError(409, 'ALREADY_REVIEWED', `This business is already ${next}`)
  }
  const before = snapshot(business)

  business.set({
    status: next,
    reviewedBy: req.user!.id,
    reviewedAt: new Date(),
    rejectionReason:
      action === 'reject'
        ? reason || 'We could not verify your business details'
        : undefined,
  })
  await business.save()

  await writeAuditLog(req, {
    action: `business.${action}`,
    targetType: 'business',
    targetId: business._id,
    targetLabel: business.companyName,
    before,
    after: snapshot(business),
  })
  await notifyUser(business.owner, {
    type: action === 'approve' ? 'business.approved' : 'business.rejected',
    data: { business: business.companyName, reason: business.rejectionReason },
    link: '/dashboard',
  })

  await business.populate([OWNER_POPULATE, REVIEWER_POPULATE])
  sendSuccess(res, { business })
}
