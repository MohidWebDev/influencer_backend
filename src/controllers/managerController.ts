import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter } from 'mongoose'
import '../types/express'
import { MANAGER_IDENTITY_FIELDS } from '../constants/manager'
import { AuditLog } from '../models/AuditLog'
import { ManagerProfile, type IManagerProfile } from '../models/ManagerProfile'
import { Representation } from '../models/Representation'
import { User } from '../models/User'
import { writeAuditLog } from '../services/auditService'
import { notifyAdmins, notifyUser } from '../services/notificationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  adminListManagersQuerySchema,
  managerProfileSchema,
  reviewManagerSchema,
} from '../validators/managerValidator'

const OWNER_POPULATE = { path: 'owner', select: 'name email role status createdAt' }
const REVIEWER_POPULATE = { path: 'reviewedBy', select: 'name email' }

type ManagerDoc = NonNullable<Awaited<ReturnType<typeof ManagerProfile.findOne>>>

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const managerLink = (manager: { _id: unknown }) => `/admin/managers/${String(manager._id)}`

async function ownerName(manager: IManagerProfile) {
  return (await User.findById(manager.owner).select('name'))?.name
}

// Audit ke liye nishani (label): manager ka naam aur agency
async function labelOf(manager: IManagerProfile) {
  const name = await ownerName(manager)
  return manager.agencyName ? `${name} (${manager.agencyName})` : name
}

// GET /api/manager/profile -> meri details aur tasdeeq ki halat (ya null)
export async function getMyManagerProfile(req: Request, res: Response) {
  const manager = await ManagerProfile.findOne({ owner: req.user!.id })
  sendSuccess(res, { manager })
}

// PUT /api/manager/profile -> pehli dafa bhejo, ya theek kar ke dobara.
// Pehchaan (agency, website, social links, mulk) badle ya reject hua ho to dobara review
export async function saveMyManagerProfile(req: Request, res: Response) {
  const input = parseOrThrow(managerProfileSchema, req.body ?? {})
  const values = { ...input, contactPhone: input.contactPhone || undefined }
  const existing = await ManagerProfile.findOne({ owner: req.user!.id })

  if (!existing) {
    const manager = await ManagerProfile.create({ ...values, owner: req.user!.id })
    await notifyNewManager(manager)
    return sendSuccess(res, { manager }, 201)
  }

  // Social links bhi pehchaan hain: badlen to dobara review
  const links = (accounts: { url: string }[]) => accounts.map((a) => a.url).sort().join(' ')
  const identityChanged =
    MANAGER_IDENTITY_FIELDS.some((field) => (existing[field] ?? '') !== (values[field] ?? '')) ||
    links(existing.socialAccounts) !== links(values.socialAccounts)
  existing.set(values)
  const restart = identityChanged || existing.status === 'rejected'
  if (restart) {
    existing.set({
      status: 'pending',
      submittedAt: new Date(),
      reviewedBy: undefined,
      reviewedAt: undefined,
      rejectionReason: undefined,
    })
  }
  await existing.save()
  if (restart) await notifyNewManager(existing)
  sendSuccess(res, { manager: existing })
}

async function notifyNewManager(manager: ManagerDoc) {
  await notifyAdmins({
    type: 'manager.new',
    data: { manager: (await labelOf(manager)) ?? '' },
    link: managerLink(manager),
  })
}

// GET /api/admin/managers -> tasdeeq ki queue (pending purane pehle)
export async function adminListManagers(req: Request, res: Response) {
  const query = parseOrThrow(adminListManagersQuerySchema, req.query)
  const filter: QueryFilter<IManagerProfile> = {}
  if (query.status) filter.status = query.status
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i')
    const owners = await User.find({ $or: [{ name: pattern }, { email: pattern }] })
      .select('_id')
      .limit(200)
    filter.$or = [
      { agencyName: pattern },
      { websiteUrl: pattern },
      { 'socialAccounts.url': pattern },
      { owner: { $in: owners.map((o) => o._id) } },
    ]
  }

  const skip = (query.page - 1) * query.limit
  const [managers, total] = await Promise.all([
    ManagerProfile.find(filter)
      .populate(OWNER_POPULATE)
      .sort({ submittedAt: query.status === 'pending' ? 1 : -1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    ManagerProfile.countDocuments(filter),
  ])
  sendSuccess(res, { managers }, 200, { page: query.page, limit: query.limit, total })
}

async function findManager(id: string) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Manager not found')
  const manager = await ManagerProfile.findById(id)
  if (!manager) throw new AppError(404, 'NOT_FOUND', 'Manager not found')
  return manager
}

// Admin page: details, owner, kin talents ke saath jura hai, history
async function adminPayload(manager: ManagerDoc) {
  await manager.populate([OWNER_POPULATE, REVIEWER_POPULATE])
  const ownerId = (manager.owner as unknown as { _id: unknown })._id ?? manager.owner
  const representations = await Representation.find({ manager: ownerId })
    .populate({ path: 'person', select: 'name slug photoUrl verified' })
    .sort({ updatedAt: -1 })
    .limit(100)
  const history = await AuditLog.find({ targetType: 'manager', targetId: manager._id })
    .sort({ createdAt: -1 })
    .limit(50)
  return { manager, representations, history }
}

// GET /api/admin/managers/:id
export async function adminGetManager(req: Request, res: Response) {
  sendSuccess(res, await adminPayload(await findManager(String(req.params.id))))
}

// PATCH /api/admin/managers/:id -> approve ya reject. Approved ko reject karne pe
// us ke saare rishte khatam (talents ko pata chalta hai)
export async function adminReviewManager(req: Request, res: Response) {
  const { action, reason } = parseOrThrow(reviewManagerSchema, req.body ?? {})
  const manager = await findManager(String(req.params.id))
  const before = { status: manager.status, rejectionReason: manager.rejectionReason }

  if (action === 'approve') {
    if (manager.status === 'approved') {
      throw new AppError(409, 'ALREADY_REVIEWED', 'This manager is already approved')
    }
    manager.set({ status: 'approved', reviewedBy: req.user!.id, reviewedAt: new Date(), rejectionReason: undefined })
  } else {
    if (manager.status === 'rejected') {
      throw new AppError(409, 'ALREADY_REVIEWED', 'This manager is already rejected')
    }
    manager.set({
      status: 'rejected',
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      rejectionReason: reason || 'We could not verify your details',
    })
  }
  await manager.save()

  await writeAuditLog(req, {
    action: action === 'approve' ? 'manager.approve' : 'manager.reject',
    targetType: 'manager',
    targetId: manager._id,
    targetLabel: await labelOf(manager),
    before,
    after: { status: manager.status, rejectionReason: manager.rejectionReason },
  })
  await notifyUser(manager.owner, {
    type: action === 'approve' ? 'manager.approved' : 'manager.rejected',
    data: action === 'approve' ? {} : { reason: manager.rejectionReason ?? '' },
    link: '/dashboard',
  })
  if (action === 'reject') await endAllFor(manager)

  sendSuccess(res, await adminPayload(manager))
}

// Tasdeeq wapas: chalte rishte khatam, khuli darkhwastein band
async function endAllFor(manager: ManagerDoc) {
  const now = new Date()
  const active = await Representation.find({ manager: manager.owner, status: 'active' }).populate({
    path: 'person',
    select: 'name',
  })
  const managerName = (await ownerName(manager)) ?? ''
  for (const rep of active) {
    rep.set({ status: 'ended', endedAt: now, endedBy: null })
    await rep.save()
    await notifyUser(rep.talent, {
      type: 'representation.ended',
      data: { name: managerName, person: (rep.person as unknown as { name?: string })?.name ?? '' },
      link: '/dashboard/my-manager',
    })
  }
  await Representation.updateMany(
    { manager: manager.owner, status: { $in: ['invited', 'requested'] } },
    { $set: { status: 'cancelled', endedAt: now, endedBy: null } },
  )
}
