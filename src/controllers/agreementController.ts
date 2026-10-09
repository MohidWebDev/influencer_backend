import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter } from 'mongoose'
import '../types/express'
import {
  MAX_SIGN_ATTEMPTS,
  SIGN_CODE_MINUTES,
  SIGN_RESEND_SECONDS,
  type AgreementParty,
} from '../constants/agreements'
import { Agreement, type IAgreement, type IAgreementTerms } from '../models/Agreement'
import { AuditLog } from '../models/AuditLog'
import { BusinessProfile } from '../models/BusinessProfile'
import { HireRequest } from '../models/HireRequest'
import { Person } from '../models/Person'
import { User } from '../models/User'
import { writeAuditLog } from '../services/auditService'
import { agreementSignCodeEmail } from '../services/emailTemplates'
import { sendMail } from '../services/mailService'
import { notifyAdmins, notifyUser } from '../services/notificationService'
import type { NotificationType } from '../models/Notification'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { generateClaimCode, hashClaimCode, isClaimCodeValid } from '../utils/claimCode'
import { parseOrThrow } from '../utils/validation'
import {
  adminListAgreementsQuerySchema,
  cancelAgreementSchema,
  createAgreementSchema,
  deliverMilestoneSchema,
  disputeSchema,
  requestChangesSchema,
  resolveDisputeSchema,
  reviewSchema,
  signAgreementSchema,
  updateTermsSchema,
  type AgreementTermsInput,
} from '../validators/agreementValidator'

type AgreementDoc = NonNullable<Awaited<ReturnType<typeof Agreement.findOne>>>

const POPULATE = [
  { path: 'business', select: 'name email' },
  { path: 'talent', select: 'name email' },
  { path: 'person', select: 'name slug headline photoUrl verified' },
  { path: 'businessProfile', select: 'companyName websiteUrl industry country city status' },
  { path: 'hire', select: 'title createdAt' },
  { path: 'dispute.resolvedBy', select: 'name email' },
]

const other = (side: AgreementParty): AgreementParty => (side === 'business' ? 'talent' : 'business')
const userOf = (agreement: IAgreement, side: AgreementParty) =>
  side === 'business' ? agreement.business : agreement.talent
const agreementLink = (agreement: { _id: unknown }) => `/agreements/${String(agreement._id)}`

function cleanTerms(input: AgreementTermsInput): IAgreementTerms {
  return {
    ...input,
    milestones: input.milestones.map((m) => ({
      title: m.title,
      amount: m.amount,
      dueDate: m.dueDate ?? undefined,
    })),
    paymentTerms: input.paymentTerms || undefined,
    usageRights: input.usageRights || undefined,
    cancellationTerms: input.cancellationTerms || undefined,
  }
}

// Sign hone wali cheez ka fingerprint: kaun, kis se, kaunsa version, kya shartein.
// Baad mein koi bhi field badle to hash mel nahi khayega
function fingerprint(agreement: AgreementDoc) {
  const t = agreement.terms
  const payload = {
    agreement: String(agreement._id),
    version: agreement.version,
    business: String(agreement.business),
    talent: String(agreement.talent),
    person: String(agreement.person),
    terms: {
      title: t.title,
      scope: t.scope,
      currency: t.currency,
      milestones: t.milestones.map((m) => ({
        title: m.title,
        amount: m.amount,
        dueDate: m.dueDate ? new Date(m.dueDate).toISOString() : null,
      })),
      paymentTerms: t.paymentTerms ?? null,
      usageRights: t.usageRights ?? null,
      revisions: t.revisions,
      cancellationTerms: t.cancellationTerms ?? null,
    },
  }
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

// Muahide ke dono taraf ke liye notification ke naam
async function names(agreement: AgreementDoc) {
  const [business, person] = await Promise.all([
    BusinessProfile.findById(agreement.businessProfile).select('companyName'),
    Person.findById(agreement.person).select('name'),
  ])
  return { business: business?.companyName, person: person?.name, title: agreement.terms.title }
}

async function notifySide(
  agreement: AgreementDoc,
  side: AgreementParty,
  type: NotificationType,
  extra: Record<string, string | undefined> = {},
) {
  await notifyUser(userOf(agreement, side), {
    type,
    data: { ...(await names(agreement)), ...extra },
    link: agreementLink(agreement),
  })
}

async function audit(req: Request, action: string, agreement: AgreementDoc, after?: unknown) {
  await writeAuditLog(req, {
    action,
    targetType: 'agreement',
    targetId: agreement._id,
    targetLabel: agreement.terms.title,
    after: after ?? { status: agreement.status, version: agreement.version },
  })
}

async function respond(res: Response, agreement: AgreementDoc, status = 200) {
  await agreement.populate(POPULATE)
  sendSuccess(res, { agreement }, status)
}

// Sirf muahide ke dono taraf (aur admin dekh sakta hai). side = login user kis taraf hai
async function loadAgreement(req: Request, withCodes = false) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Agreement not found')
  const query = Agreement.findById(id)
  if (withCodes) query.select('+signCodes')
  const agreement = await query
  if (!agreement) throw new AppError(404, 'NOT_FOUND', 'Agreement not found')
  const me = req.user!.id
  const side: AgreementParty | null =
    String(agreement.business) === me ? 'business' : String(agreement.talent) === me ? 'talent' : null
  if (!side) throw new AppError(404, 'NOT_FOUND', 'Agreement not found')
  return { agreement, side }
}

function requireStatus(agreement: AgreementDoc, ...statuses: IAgreement['status'][]) {
  if (!statuses.includes(agreement.status)) {
    throw new AppError(409, 'INVALID_STATE', `This is not allowed for a ${agreement.status} agreement`)
  }
}

function requireSide(side: AgreementParty, wanted: AgreementParty) {
  if (side !== wanted) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this')
  }
}

// POST /api/agreements -> business, accept hui hire request se muahida shuru kare
export async function createAgreement(req: Request, res: Response) {
  const { hireId, terms } = parseOrThrow(createAgreementSchema, req.body ?? {})
  const hire = await HireRequest.findOne({ _id: hireId, business: req.user!.id })
  if (!hire) throw new AppError(404, 'NOT_FOUND', 'Hire request not found')
  if (hire.status !== 'accepted') {
    throw new AppError(409, 'HIRE_NOT_ACCEPTED', 'The talent has to accept the hire request first')
  }
  if (hire.agreement || (await Agreement.exists({ hire: hire._id }))) {
    throw new AppError(409, 'AGREEMENT_EXISTS', 'There is already an agreement for this request')
  }

  const now = new Date()
  const clean = cleanTerms(terms)
  const agreement = await Agreement.create({
    hire: hire._id,
    business: hire.business,
    businessProfile: hire.businessProfile,
    talent: hire.talent,
    person: hire.person,
    terms: clean,
    proposedBy: 'business',
    proposedAt: now,
    history: [{ version: 1, terms: clean, proposedBy: 'business', proposedAt: now }],
  })
  hire.agreement = agreement._id
  await hire.save()

  await notifySide(agreement, 'talent', 'agreement.proposed')
  await respond(res, agreement, 201)
}

// GET /api/agreements -> mere saare muahide (business ya talent), naye pehle
export async function listMyAgreements(req: Request, res: Response) {
  const me = req.user!.id
  const agreements = await Agreement.find({ $or: [{ business: me }, { talent: me }] })
    .select('-history')
    .populate(POPULATE)
    .sort({ updatedAt: -1 })
    .limit(100)
  sendSuccess(res, { agreements })
}

// GET /api/agreements/:id
export async function getAgreement(req: Request, res: Response) {
  const { agreement, side } = await loadAgreement(req)
  await agreement.populate(POPULATE)
  sendSuccess(res, { agreement, side })
}

// PUT /api/agreements/:id/terms -> counter-offer: naya version, purane sign khatam
export async function updateTerms(req: Request, res: Response) {
  const { terms } = parseOrThrow(updateTermsSchema, req.body ?? {})
  const { agreement, side } = await loadAgreement(req, true)
  requireStatus(agreement, 'negotiating')

  const now = new Date()
  const clean = cleanTerms(terms)
  agreement.set({
    terms: clean,
    version: agreement.version + 1,
    proposedBy: side,
    proposedAt: now,
    signatures: {},
    signCodes: {},
  })
  agreement.history.push({ version: agreement.version, terms: clean, proposedBy: side, proposedAt: now })
  await agreement.save()

  await notifySide(agreement, other(side), 'agreement.updated')
  await respond(res, agreement)
}

// POST /api/agreements/:id/sign/code -> sign karne ka code login email pe
export async function sendSignCode(req: Request, res: Response) {
  const { agreement, side } = await loadAgreement(req, true)
  requireStatus(agreement, 'negotiating')
  if (agreement.signatures[side]?.version === agreement.version) {
    throw new AppError(409, 'ALREADY_SIGNED', 'You already signed this version')
  }

  const existing = agreement.signCodes?.[side]
  const waited = existing?.lastSentAt ? Date.now() - existing.lastSentAt.getTime() : Infinity
  if (waited < SIGN_RESEND_SECONDS * 1000) {
    const retryIn = Math.ceil((SIGN_RESEND_SECONDS * 1000 - waited) / 1000)
    throw new AppError(429, 'TOO_SOON', 'Please wait before asking for a new code', undefined, {
      retryIn,
    })
  }

  const user = await User.findById(req.user!.id).select('name email')
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in')

  const code = generateClaimCode()
  const now = new Date()
  agreement.set(`signCodes.${side}`, {
    codeHash: hashClaimCode(code, `${agreement.id}:${side}`),
    version: agreement.version,
    attempts: 0,
    lastSentAt: now,
    expiresAt: new Date(now.getTime() + SIGN_CODE_MINUTES * 60 * 1000),
  })
  await sendMail(agreementSignCodeEmail(user.email, user.name, code, agreement.terms.title, SIGN_CODE_MINUTES))
  await agreement.save()

  sendSuccess(res, { sent: true, resendIn: SIGN_RESEND_SECONDS, expiresIn: SIGN_CODE_MINUTES * 60 })
}

// POST /api/agreements/:id/sign -> code sahi = is version pe electronic signature.
// Dono ke sign ho jayen to muahida lock aur active
export async function signAgreement(req: Request, res: Response) {
  const { code } = parseOrThrow(signAgreementSchema, req.body ?? {})
  const { agreement, side } = await loadAgreement(req, true)
  requireStatus(agreement, 'negotiating')

  const pending = agreement.signCodes?.[side]
  // Code purane version ka hai (beech mein shartein badal gayi) to bekaar
  if (!pending?.codeHash || pending.version !== agreement.version) {
    throw new AppError(409, 'NO_ACTIVE_CODE', 'Ask for a new code to sign this version')
  }
  if (pending.expiresAt && pending.expiresAt < new Date()) {
    throw new AppError(410, 'CODE_EXPIRED', 'This code has expired. Ask for a new one.')
  }
  if (pending.attempts >= MAX_SIGN_ATTEMPTS) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong attempts. Ask for a new code.')
  }
  if (!isClaimCodeValid(code, `${agreement.id}:${side}`, pending.codeHash)) {
    const attempts = pending.attempts + 1
    agreement.set(`signCodes.${side}.attempts`, attempts)
    await agreement.save()
    const left = Math.max(MAX_SIGN_ATTEMPTS - attempts, 0)
    throw new AppError(
      400,
      'INVALID_CODE',
      'That code is not correct',
      { code: `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` },
      { attemptsLeft: left, maxAttempts: MAX_SIGN_ATTEMPTS },
    )
  }

  const user = await User.findById(req.user!.id).select('name email')
  const now = new Date()
  agreement.set(`signatures.${side}`, {
    version: agreement.version,
    signedAt: now,
    name: user?.name ?? '',
    email: user?.email ?? '',
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 300),
  })
  agreement.set(`signCodes.${side}`, undefined)

  const bothSigned = agreement.signatures[other(side)]?.version === agreement.version
  if (bothSigned) {
    agreement.set({
      status: 'active',
      activatedAt: now,
      signedHash: fingerprint(agreement),
      work: agreement.terms.milestones.map(() => ({ status: 'pending' })),
    })
  }
  await agreement.save()
  await audit(req, 'agreement.sign', agreement, {
    side,
    version: agreement.version,
    signedHash: agreement.signedHash,
  })

  if (bothSigned) {
    await Promise.all([
      notifySide(agreement, 'business', 'agreement.active'),
      notifySide(agreement, 'talent', 'agreement.active'),
    ])
  } else {
    await notifySide(agreement, other(side), 'agreement.signed')
  }
  await respond(res, agreement)
}

// POST /api/agreements/:id/cancel -> sign hone se pehle koi bhi taraf wapas le sakta hai
export async function cancelAgreement(req: Request, res: Response) {
  const { reason } = parseOrThrow(cancelAgreementSchema, req.body ?? {})
  const { agreement, side } = await loadAgreement(req, true)
  requireStatus(agreement, 'negotiating')
  agreement.set({
    status: 'cancelled',
    cancelledAt: new Date(),
    cancelledBy: side,
    cancelReason: reason || undefined,
    signCodes: {},
  })
  await agreement.save()
  await notifySide(agreement, other(side), 'agreement.cancelled', { reason: reason || undefined })
  await respond(res, agreement)
}

function findMilestone(agreement: AgreementDoc, req: Request) {
  const index = Number(req.params.index)
  const work = Number.isInteger(index) ? agreement.work[index] : undefined
  if (!work) throw new AppError(404, 'NOT_FOUND', 'Milestone not found')
  return { index, work, title: agreement.terms.milestones[index]?.title }
}

// POST /api/agreements/:id/milestones/:index/deliver -> talent kaam de
export async function deliverMilestone(req: Request, res: Response) {
  const { note, link } = parseOrThrow(deliverMilestoneSchema, req.body ?? {})
  const { agreement, side } = await loadAgreement(req)
  requireSide(side, 'talent')
  requireStatus(agreement, 'active')
  const { index, work, title } = findMilestone(agreement, req)
  if (work.status !== 'pending') {
    throw new AppError(409, 'INVALID_STATE', `This milestone is already ${work.status}`)
  }
  agreement.set(`work.${index}`, {
    status: 'delivered',
    deliveredAt: new Date(),
    deliveryNote: note,
    deliveryLink: link || undefined,
    changesNote: work.changesNote,
  })
  await agreement.save()
  await notifySide(agreement, 'business', 'agreement.delivered', { milestone: title })
  await respond(res, agreement)
}

// POST /api/agreements/:id/milestones/:index/approve -> business mane; sab mane to completed
export async function approveMilestone(req: Request, res: Response) {
  const { agreement, side } = await loadAgreement(req)
  requireSide(side, 'business')
  requireStatus(agreement, 'active')
  const { index, work, title } = findMilestone(agreement, req)
  if (work.status !== 'delivered') {
    throw new AppError(409, 'INVALID_STATE', 'Only a delivered milestone can be approved')
  }
  const now = new Date()
  agreement.set(`work.${index}.status`, 'approved')
  agreement.set(`work.${index}.approvedAt`, now)

  const done = agreement.work.every((w) => w.status === 'approved')
  if (done) agreement.set({ status: 'completed', completedAt: now })
  await agreement.save()

  if (done) {
    await Promise.all([
      notifySide(agreement, 'business', 'agreement.completed'),
      notifySide(agreement, 'talent', 'agreement.completed'),
    ])
  } else {
    await notifySide(agreement, 'talent', 'agreement.approved', { milestone: title })
  }
  await respond(res, agreement)
}

// POST /api/agreements/:id/milestones/:index/request-changes -> business tabdeeli maange
// (shartein mein likhi revisions tak)
export async function requestChanges(req: Request, res: Response) {
  const { note } = parseOrThrow(requestChangesSchema, req.body ?? {})
  const { agreement, side } = await loadAgreement(req)
  requireSide(side, 'business')
  requireStatus(agreement, 'active')
  const { index, work, title } = findMilestone(agreement, req)
  if (work.status !== 'delivered') {
    throw new AppError(409, 'INVALID_STATE', 'Only a delivered milestone can be sent back')
  }
  if (agreement.revisionsUsed >= agreement.terms.revisions) {
    throw new AppError(409, 'NO_REVISIONS_LEFT', 'All the revisions in the agreement are used')
  }
  agreement.set(`work.${index}.status`, 'pending')
  agreement.set(`work.${index}.changesNote`, note)
  agreement.revisionsUsed += 1
  await agreement.save()
  await notifySide(agreement, 'talent', 'agreement.changes_requested', { milestone: title })
  await respond(res, agreement)
}

// POST /api/agreements/:id/dispute -> masla: admin dekhega
export async function openDispute(req: Request, res: Response) {
  const { reason } = parseOrThrow(disputeSchema, req.body ?? {})
  const { agreement, side } = await loadAgreement(req)
  requireStatus(agreement, 'active')
  agreement.set({
    status: 'disputed',
    dispute: { openedBy: side, reason, openedAt: new Date() },
  })
  await agreement.save()
  await audit(req, 'agreement.dispute', agreement, { status: agreement.status, openedBy: side, reason })

  await notifySide(agreement, other(side), 'agreement.disputed')
  await notifyAdmins({
    type: 'agreement.disputed_admin',
    data: await names(agreement),
    link: `/admin/agreements/${agreement.id}`,
  })
  await respond(res, agreement)
}

// POST /api/agreements/:id/review -> mukammal hone ke baad har taraf ek dafa rating de
export async function reviewAgreement(req: Request, res: Response) {
  const { rating, comment } = parseOrThrow(reviewSchema, req.body ?? {})
  const { agreement, side } = await loadAgreement(req)
  requireStatus(agreement, 'completed')
  if (agreement.reviews?.[side]) {
    throw new AppError(409, 'ALREADY_REVIEWED', 'You already left a review')
  }
  agreement.set(`reviews.${side}`, { rating, comment: comment || undefined, createdAt: new Date() })
  await agreement.save()
  await notifySide(agreement, other(side), 'agreement.reviewed', { rating: String(rating) })
  await respond(res, agreement)
}

// GET /api/people/:slug/reviews -> public: businesses ki talent ke baare mein reviews
export async function listPersonReviews(req: Request, res: Response) {
  const person = await Person.findOne({ slug: String(req.params.slug), visibility: 'visible' }).select('_id')
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  const agreements = await Agreement.find({
    person: person._id,
    status: 'completed',
    'reviews.business': { $exists: true },
  })
    .select('reviews.business businessProfile completedAt')
    .populate({ path: 'businessProfile', select: 'companyName' })
    .sort({ completedAt: -1 })
    .limit(50)

  const reviews = agreements.map((a) => ({
    rating: a.reviews.business!.rating,
    comment: a.reviews.business!.comment,
    createdAt: a.reviews.business!.createdAt,
    business: (a.businessProfile as unknown as { companyName?: string } | null)?.companyName,
  }))
  const average = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : null
  sendSuccess(res, { rating: { average, count: reviews.length }, reviews })
}

// Talents ki di hui rating, har business user ki (hire request card ke liye)
export async function businessRatings(businessUserIds: unknown[]) {
  if (businessUserIds.length === 0) return new Map<string, { average: number; count: number }>()
  const rows = await Agreement.aggregate<{ _id: unknown; average: number; count: number }>([
    {
      $match: {
        business: { $in: businessUserIds },
        status: 'completed',
        'reviews.talent': { $exists: true },
      },
    },
    { $group: { _id: '$business', average: { $avg: '$reviews.talent.rating' }, count: { $sum: 1 } } },
  ])
  return new Map(
    rows.map((r) => [String(r._id), { average: Math.round(r.average * 10) / 10, count: r.count }]),
  )
}

// GET /api/admin/agreements -> dispute wale pehle
export async function adminListAgreements(req: Request, res: Response) {
  const query = parseOrThrow(adminListAgreementsQuerySchema, req.query)
  const filter: QueryFilter<IAgreement> = {}
  if (query.status) filter.status = query.status
  const skip = (query.page - 1) * query.limit
  const [agreements, total] = await Promise.all([
    Agreement.find(filter)
      .select('-history')
      .populate(POPULATE)
      .sort({ updatedAt: -1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    Agreement.countDocuments(filter),
  ])
  sendSuccess(res, { agreements }, 200, { page: query.page, limit: query.limit, total })
}

// GET /api/admin/agreements/:id -> poora muahida, versions aur audit history
export async function adminGetAgreement(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Agreement not found')
  const agreement = await Agreement.findById(id).populate(POPULATE)
  if (!agreement) throw new AppError(404, 'NOT_FOUND', 'Agreement not found')
  const history = await AuditLog.find({ targetType: 'agreement', targetId: agreement._id })
    .sort({ createdAt: -1 })
    .limit(50)
  sendSuccess(res, { agreement, history })
}

// POST /api/admin/agreements/:id/resolve -> dispute ka faisla
export async function adminResolveDispute(req: Request, res: Response) {
  const { outcome, note } = parseOrThrow(resolveDisputeSchema, req.body ?? {})
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Agreement not found')
  const agreement = await Agreement.findById(id)
  if (!agreement) throw new AppError(404, 'NOT_FOUND', 'Agreement not found')
  requireStatus(agreement, 'disputed')

  const now = new Date()
  agreement.set({
    'dispute.outcome': outcome,
    'dispute.note': note,
    'dispute.resolvedAt': now,
    'dispute.resolvedBy': req.user!.id,
  })
  if (outcome === 'continue') agreement.status = 'active'
  if (outcome === 'complete') agreement.set({ status: 'completed', completedAt: now })
  if (outcome === 'cancel') {
    agreement.set({ status: 'cancelled', cancelledAt: now, cancelledBy: 'admin', cancelReason: note })
  }
  await agreement.save()
  await audit(req, 'agreement.resolve', agreement, { status: agreement.status, outcome, note })

  await Promise.all([
    notifySide(agreement, 'business', 'agreement.resolved', { outcome }),
    notifySide(agreement, 'talent', 'agreement.resolved', { outcome }),
  ])
  await agreement.populate(POPULATE)
  sendSuccess(res, { agreement })
}
