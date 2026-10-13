import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter, type Types } from 'mongoose'
import '../types/express'
import { BusinessProfile } from '../models/BusinessProfile'
import { Campaign, type ICampaign } from '../models/Campaign'
import { CampaignApplication } from '../models/CampaignApplication'
import { HireRequest } from '../models/HireRequest'
import { Person } from '../models/Person'
import { User } from '../models/User'
import { notifyUser } from '../services/notificationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  applySchema,
  createCampaignSchema,
  listCampaignsQuerySchema,
  respondApplicationSchema,
  updateCampaignSchema,
} from '../validators/campaignValidator'

type CampaignDoc = NonNullable<Awaited<ReturnType<typeof Campaign.findOne>>>

const PERSON_FIELDS = 'name slug headline photoUrl verified country city totalFollowers professions'
const MY_APPLICATIONS_LINK = '/dashboard/applications'
const HIRES_LINK = '/dashboard/hire-requests'
const campaignLink = (campaign: { _id: unknown }) => `/dashboard/campaigns/${String(campaign._id)}`

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

// Aakhri tareekh guzar gayi?
const isPastDeadline = (campaign: Pick<ICampaign, 'deadline'>) =>
  Boolean(campaign.deadline && campaign.deadline < startOfToday())

// Talents ke liye khuli: open aur aakhri tareekh nahi guzri
const openFilter = (): QueryFilter<ICampaign> => ({
  status: 'open',
  $or: [{ deadline: null }, { deadline: { $gte: startOfToday() } }],
})

async function isVerifiedBusiness(userId: Types.ObjectId | string) {
  const profile = await BusinessProfile.findOne({ owner: userId }).select('status')
  return profile?.status === 'approved'
}

function notVerifiedError() {
  return new AppError(
    403,
    'BUSINESS_NOT_VERIFIED',
    'Your organization must be verified before you can publish a campaign. You can save it as a draft for now',
  )
}

// Business ki public pehchaan (campaign card pe): naam, qism, mulk, verified
async function businessCards(ownerIds: Types.ObjectId[]) {
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: ownerIds } }).select('name company'),
    BusinessProfile.find({ owner: { $in: ownerIds } }).select(
      'owner companyName organizationType country city websiteUrl status',
    ),
  ])
  const profileOf = new Map(profiles.map((p) => [String(p.owner), p]))
  return new Map(
    users.map((user) => {
      const p = profileOf.get(String(user._id))
      return [
        String(user._id),
        {
          _id: user._id,
          name: p?.companyName ?? user.company?.companyName ?? user.name,
          organizationType: p?.organizationType ?? user.company?.organizationType,
          country: p?.country ?? user.company?.country,
          city: p?.city,
          websiteUrl: p?.websiteUrl ?? user.company?.websiteUrl,
          verified: p?.status === 'approved',
        },
      ]
    }),
  )
}

// Har campaign pe kitni applications aur kitne select hue
async function applicationCounts(campaignIds: Types.ObjectId[]) {
  const rows = await CampaignApplication.aggregate<{ _id: Types.ObjectId; status: string; count: number }>([
    { $match: { campaign: { $in: campaignIds }, status: { $ne: 'withdrawn' } } },
    { $group: { _id: { campaign: '$campaign', status: '$status' }, count: { $sum: 1 } } },
    { $project: { _id: '$_id.campaign', status: '$_id.status', count: 1 } },
  ])
  const counts = new Map<string, { applications: number; accepted: number; pending: number }>()
  for (const row of rows) {
    const entry = counts.get(String(row._id)) ?? { applications: 0, accepted: 0, pending: 0 }
    entry.applications += row.count
    if (row.status === 'accepted') entry.accepted += row.count
    if (row.status === 'pending') entry.pending += row.count
    counts.set(String(row._id), entry)
  }
  return counts
}

async function withDetails(campaigns: CampaignDoc[]) {
  const [cards, counts] = await Promise.all([
    businessCards(campaigns.map((c) => c.owner)),
    applicationCounts(campaigns.map((c) => c._id)),
  ])
  return campaigns.map((campaign) => ({
    ...(campaign.toJSON() as unknown as Record<string, unknown>),
    _id: campaign._id,
    business: cards.get(String(campaign.owner)) ?? null,
    counts: counts.get(String(campaign._id)) ?? { applications: 0, accepted: 0, pending: 0 },
    acceptingApplications: campaign.status === 'open' && !isPastDeadline(campaign),
  }))
}

async function findOwnCampaign(req: Request) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Campaign not found')
  const campaign = await Campaign.findOne({ _id: id, owner: req.user!.id })
  if (!campaign) throw new AppError(404, 'NOT_FOUND', 'Campaign not found')
  return campaign
}

// Talent ki apni (claimed, public) profile
async function ownProfile(userId: string) {
  return Person.findOne({ claimedBy: userId, isDraft: false, visibility: 'visible' }).select('name')
}

// ---------- Public ----------

// GET /api/campaigns -> khuli campaigns, naye pehle
export async function listCampaigns(req: Request, res: Response) {
  const query = parseOrThrow(listCampaignsQuerySchema, req.query)
  const filter: QueryFilter<ICampaign> = openFilter()
  if (query.category) filter.category = query.category
  // Kisi bhi mulk wali campaigns bhi us mulk ke talent ke liye hain
  if (query.country) filter.$and = [{ $or: [{ country: query.country }, { country: null }, { country: '' }] }]
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i')
    filter.$and = [...(filter.$and ?? []), { $or: [{ title: pattern }, { brief: pattern }] }]
  }
  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Campaign.countDocuments(filter),
  ])
  sendSuccess(res, { campaigns: await withDetails(campaigns) }, 200, {
    page: query.page,
    limit: query.limit,
    total,
  })
}

// GET /api/campaigns/:id -> ek campaign. Draft / band sirf maalik dekhe.
// Talent login ho to us ki apni application bhi (agar ki ho)
export async function getCampaign(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Campaign not found')
  const campaign = await Campaign.findById(id)
  const isOwner = Boolean(campaign && req.user && String(campaign.owner) === req.user.id)
  if (!campaign || (campaign.status === 'draft' && !isOwner)) {
    throw new AppError(404, 'NOT_FOUND', 'Campaign not found')
  }
  const [json] = await withDetails([campaign])
  const myApplication =
    req.user?.role === 'talent'
      ? await CampaignApplication.findOne({ campaign: campaign._id, applicant: req.user.id }).select(
          'status pitch createdAt respondedAt hire',
        )
      : null
  sendSuccess(res, { campaign: json, isOwner, myApplication })
}

// ---------- Business ----------

// GET /api/campaigns/mine -> meri saari campaigns (draft bhi)
export async function listMyCampaigns(req: Request, res: Response) {
  const campaigns = await Campaign.find({ owner: req.user!.id }).sort({ createdAt: -1 }).limit(200)
  sendSuccess(res, {
    campaigns: await withDetails(campaigns),
    canPublish: await isVerifiedBusiness(req.user!.id),
  })
}

// POST /api/campaigns -> nayi campaign. Open sirf verified business; warna draft bhejo
export async function createCampaign(req: Request, res: Response) {
  const input = parseOrThrow(createCampaignSchema, req.body ?? {})
  if (input.status === 'open' && !(await isVerifiedBusiness(req.user!.id))) throw notVerifiedError()
  const campaign = await Campaign.create({
    ...input,
    budget: input.budget ?? undefined,
    country: input.country || undefined,
    deadline: input.deadline ?? undefined,
    owner: req.user!.id,
    publishedAt: input.status === 'open' ? new Date() : undefined,
  })
  const [json] = await withDetails([campaign])
  sendSuccess(res, { campaign: json }, 201)
}

// PATCH /api/campaigns/:id -> details badlo, publish karo, band karo ya dobara kholo
export async function updateCampaign(req: Request, res: Response) {
  const input = parseOrThrow(updateCampaignSchema, req.body ?? {})
  const campaign = await findOwnCampaign(req)
  const { status, ...fields } = input

  // Jitne select ho chuke, us se kam jagah nahi
  if (fields.slots !== undefined) {
    const accepted = await CampaignApplication.countDocuments({ campaign: campaign._id, status: 'accepted' })
    if (fields.slots < accepted) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', {
        slots: `You already selected ${accepted} talent(s)`,
      })
    }
  }

  campaign.set({
    ...fields,
    ...(fields.budget !== undefined ? { budget: fields.budget ?? undefined } : {}),
    ...(fields.country !== undefined ? { country: fields.country || undefined } : {}),
    ...(fields.deadline !== undefined ? { deadline: fields.deadline ?? undefined } : {}),
  })

  if (status && status !== campaign.status) {
    if (status === 'open') {
      if (!(await isVerifiedBusiness(req.user!.id))) throw notVerifiedError()
      campaign.publishedAt = campaign.publishedAt ?? new Date()
      campaign.closedAt = undefined
    }
    if (status === 'closed') campaign.closedAt = new Date()
    // Applications aa chuki hon to wapas draft nahi (talents ko dikh chuki hai)
    if (status === 'draft' && (await CampaignApplication.exists({ campaign: campaign._id }))) {
      throw new AppError(409, 'INVALID_STATE', 'Talents have applied already. Close the campaign instead')
    }
    campaign.status = status
  }
  await campaign.save()
  const [json] = await withDetails([campaign])
  sendSuccess(res, { campaign: json })
}

// DELETE /api/campaigns/:id -> campaign aur us ki applications mita do
// (select hue talents ki hire requests / muahide rehte hain)
export async function deleteCampaign(req: Request, res: Response) {
  const campaign = await findOwnCampaign(req)
  await CampaignApplication.deleteMany({ campaign: campaign._id })
  await campaign.deleteOne()
  sendSuccess(res, { deleted: true })
}

// GET /api/campaigns/:id/applications -> is campaign pe aaye talents
export async function listCampaignApplications(req: Request, res: Response) {
  const campaign = await findOwnCampaign(req)
  const applications = await CampaignApplication.find({
    campaign: campaign._id,
    status: { $ne: 'withdrawn' },
  })
    .populate({ path: 'person', select: PERSON_FIELDS })
    .sort({ createdAt: -1 })
  const [json] = await withDetails([campaign])
  sendSuccess(res, { campaign: json, applications })
}

// PATCH /api/campaigns/:id/applications/:applicationId -> select (accept) ya reject.
// Select = "accepted" hire request ban jati hai: dono ke raabte khulte hain aur muahida wahan se
export async function respondApplication(req: Request, res: Response) {
  const { action } = parseOrThrow(respondApplicationSchema, req.body ?? {})
  const campaign = await findOwnCampaign(req)
  const applicationId = String(req.params.applicationId)
  if (!isValidObjectId(applicationId)) throw new AppError(404, 'NOT_FOUND', 'Application not found')
  const application = await CampaignApplication.findOne({ _id: applicationId, campaign: campaign._id })
  if (!application) throw new AppError(404, 'NOT_FOUND', 'Application not found')
  if (application.status !== 'pending') {
    throw new AppError(409, 'INVALID_STATE', `This application was already ${application.status}`)
  }

  if (action === 'accept') {
    const business = await BusinessProfile.findOne({ owner: req.user!.id }).select('status companyName')
    if (business?.status !== 'approved') throw notVerifiedError()
    const accepted = await CampaignApplication.countDocuments({ campaign: campaign._id, status: 'accepted' })
    if (accepted >= campaign.slots) {
      throw new AppError(409, 'CAMPAIGN_FULL', 'You already selected as many talents as this campaign needs')
    }
    const now = new Date()
    const hire = await HireRequest.create({
      business: req.user!.id,
      businessProfile: business._id,
      person: application.person,
      talent: application.applicant,
      title: campaign.title,
      message: campaign.brief.slice(0, 2000),
      budget: campaign.budget,
      status: 'accepted',
      respondedAt: now,
      respondedBy: application.applicant,
      responseNote: application.pitch.slice(0, 500),
    })
    application.set({ status: 'accepted', respondedAt: now, hire: hire._id })
    await application.save()
    // Jitne chahiye the utne mil gaye: campaign band
    if (accepted + 1 >= campaign.slots && campaign.status === 'open') {
      campaign.set({ status: 'closed', closedAt: now })
      await campaign.save()
    }
    await notifyUser(application.applicant, {
      type: 'campaign.accepted',
      data: { campaign: campaign.title, business: business.companyName },
      link: HIRES_LINK,
    })
  } else {
    application.set({ status: 'rejected', respondedAt: new Date() })
    await application.save()
    await notifyUser(application.applicant, {
      type: 'campaign.rejected',
      data: { campaign: campaign.title },
      link: MY_APPLICATIONS_LINK,
    })
  }

  await application.populate({ path: 'person', select: PERSON_FIELDS })
  const [json] = await withDetails([campaign])
  sendSuccess(res, { campaign: json, application })
}

// ---------- Talent ----------

// POST /api/campaigns/:id/apply -> apni profile ke saath apply karo
export async function applyToCampaign(req: Request, res: Response) {
  const { pitch } = parseOrThrow(applySchema, req.body ?? {})
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Campaign not found')
  const campaign = await Campaign.findOne({ _id: id, status: { $ne: 'draft' } })
  if (!campaign) throw new AppError(404, 'NOT_FOUND', 'Campaign not found')
  if (campaign.status !== 'open' || isPastDeadline(campaign)) {
    throw new AppError(409, 'CAMPAIGN_CLOSED', 'This campaign is no longer taking applications')
  }

  const person = await ownProfile(req.user!.id)
  if (!person) {
    throw new AppError(
      403,
      'PROFILE_REQUIRED',
      'Claim or create your public profile first, so the business can see who you are',
    )
  }

  // Pehle wapas li thi to dobara bhej sakte hain
  const existing = await CampaignApplication.findOne({ campaign: campaign._id, applicant: req.user!.id })
  if (existing && existing.status !== 'withdrawn') {
    throw new AppError(409, 'ALREADY_APPLIED', 'You already applied to this campaign')
  }
  const application = existing ?? new CampaignApplication({
    campaign: campaign._id,
    business: campaign.owner,
    applicant: req.user!.id,
  })
  application.set({ person: person._id, pitch, status: 'pending', respondedAt: undefined })
  await application.save()

  await notifyUser(campaign.owner, {
    type: 'campaign.application',
    data: { campaign: campaign.title, person: person.name },
    link: campaignLink(campaign),
  })
  sendSuccess(res, { application }, existing ? 200 : 201)
}

// GET /api/campaigns/applications/mine -> meri applications, naye pehle
export async function listMyApplications(req: Request, res: Response) {
  const applications = await CampaignApplication.find({ applicant: req.user!.id })
    .sort({ createdAt: -1 })
    .limit(200)
  const campaigns = await Campaign.find({
    _id: { $in: applications.map((a) => a.campaign) },
    status: { $ne: 'draft' },
  })
  const details = new Map(
    (await withDetails(campaigns)).map((c) => [String(c._id), c] as const),
  )
  sendSuccess(res, {
    applications: applications.map((a) => ({
      ...(a.toJSON() as unknown as Record<string, unknown>),
      campaign: details.get(String(a.campaign)) ?? null,
    })),
  })
}

// POST /api/campaigns/applications/:applicationId/withdraw -> jawab se pehle wapas lo
export async function withdrawApplication(req: Request, res: Response) {
  const id = String(req.params.applicationId)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Application not found')
  const application = await CampaignApplication.findOne({ _id: id, applicant: req.user!.id })
  if (!application) throw new AppError(404, 'NOT_FOUND', 'Application not found')
  if (application.status !== 'pending') {
    throw new AppError(409, 'INVALID_STATE', `A ${application.status} application cannot be withdrawn`)
  }
  application.status = 'withdrawn'
  await application.save()
  sendSuccess(res, { application })
}
