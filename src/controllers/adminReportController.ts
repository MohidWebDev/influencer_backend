import type { Request, Response } from 'express'
import { isValidObjectId, type Types } from 'mongoose'
import '../types/express'
import { AuditLog } from '../models/AuditLog'
import { Report } from '../models/Report'
import { writeAuditLog } from '../services/auditService'
import { hidePerson } from '../services/personModerationService'
import { removeProfilePermanently } from '../services/profileOwnershipService'
import { ProfileRemoval } from '../models/ProfileRemoval'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import { listReportsQuerySchema, updateReportSchema } from '../validators/adminManagementValidator'

const REPORT_POPULATE = [
  { path: 'person', select: 'name slug headline photoUrl visibility claimedBy' },
  { path: 'reporter', select: 'name email role' },
  { path: 'handledBy', select: 'name email' },
]

async function findReport(id: string) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Report not found')
  const report = await Report.findById(id).populate(REPORT_POPULATE)
  if (!report) throw new AppError(404, 'NOT_FOUND', 'Report not found')
  return report
}

// GET /api/admin/reports -> queue (khule purane pehle)
export async function adminListReports(req: Request, res: Response) {
  const query = parseOrThrow(listReportsQuerySchema, req.query)
  const filter: Record<string, unknown> = {}
  if (query.status) filter.status = query.status
  if (query.reason) filter.reason = query.reason

  const isQueue = !query.status || query.status === 'open' || query.status === 'reviewing'
  const skip = (query.page - 1) * query.limit
  const [reports, total] = await Promise.all([
    Report.find(filter)
      .populate(REPORT_POPULATE)
      .sort({ createdAt: isQueue ? 1 : -1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    Report.countDocuments(filter),
  ])
  sendSuccess(res, { reports }, 200, { page: query.page, limit: query.limit, total })
}

// GET /api/admin/reports/:id -> detail + is report ki history
export async function adminGetReport(req: Request, res: Response) {
  const report = await findReport(String(req.params.id))
  const history = await AuditLog.find({ targetType: 'report', targetId: report._id })
    .sort({ createdAt: -1 })
    .limit(50)
  sendSuccess(res, { report, history })
}

// PATCH /api/admin/reports/:id -> status + admin note (+ takedown)
export async function adminUpdateReport(req: Request, res: Response) {
  const input = parseOrThrow(updateReportSchema, req.body ?? {})
  const report = await findReport(String(req.params.id))
  const before = { status: report.status, adminNote: report.adminNote }
  const person = report.person as unknown as {
    _id: Types.ObjectId
    name: string
    slug: string
  } | null

  // Profile mitana sirf removal request pe, aur report us ke saath "resolved"
  if (input.deletePerson) {
    if (report.reason !== 'removal_request' || !person) {
      throw new AppError(409, 'INVALID_STATE', 'Only a removal request can delete the profile')
    }
    if (input.status !== 'resolved') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', {
        status: 'Set the status to resolved to delete the profile',
      })
    }
  }

  report.status = input.status
  if (input.adminNote !== undefined) report.adminNote = input.adminNote
  report.handledBy = req.user!.id as never
  report.handledAt = new Date()
  await report.save()

  await writeAuditLog(req, {
    action: 'report.update',
    targetType: 'report',
    targetId: report._id,
    targetLabel: person?.name,
    before,
    after: { status: report.status, adminNote: report.adminNote },
  })

  if (input.deletePerson && person) {
    await removeProfilePermanently(person, report._id, req.user!.id)
    await writeAuditLog(req, {
      action: 'person.delete',
      targetType: 'person',
      targetId: person._id,
      targetLabel: person.name,
      before: { name: person.name, slug: person.slug },
      after: { reason: `removal request ${report._id}` },
    })
  } else if (input.status !== 'reviewing') {
    // Admin ne mitaye baghair faisla kar diya: profile rakhi jayegi (chhupi rehti hai)
    await ProfileRemoval.updateMany(
      { report: report._id, status: 'pending' },
      { $set: { status: 'kept', decidedAt: new Date(), decidedBy: req.user!.id } },
    )
  }

  if (input.hidePerson && !input.deletePerson && person?._id) {
    const hidden = await hidePerson(person._id)
    await writeAuditLog(req, {
      action: 'person.hide',
      targetType: 'person',
      targetId: person._id,
      targetLabel: person.name,
      before: { visibility: 'visible' },
      after: { visibility: hidden?.visibility, reason: `report ${report._id}` },
    })
  }

  await report.populate(REPORT_POPULATE)
  sendSuccess(res, { report })
}
