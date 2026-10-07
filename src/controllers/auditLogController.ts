import type { Request, Response } from 'express'
import { AuditLog } from '../models/AuditLog'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import { listAuditLogsQuerySchema } from '../validators/adminManagementValidator'

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// GET /api/admin/audit-logs -> sirf parhne ke liye, naye pehle
export async function adminListAuditLogs(req: Request, res: Response) {
  const query = parseOrThrow(listAuditLogsQuerySchema, req.query)
  const filter: Record<string, unknown> = {}
  // "claim" likho to claim.approve, claim.reject sab aa jayein
  if (query.action) filter.action = new RegExp(`^${escapeRegex(query.action)}`)
  if (query.targetType) filter.targetType = query.targetType
  if (query.targetId) filter.targetId = query.targetId
  if (query.actor) filter.actor = query.actor
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from && { $gte: query.from }),
      ...(query.to && { $lte: query.to }),
    }
  }

  const skip = (query.page - 1) * query.limit
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate({ path: 'actor', select: 'name email' })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit),
    AuditLog.countDocuments(filter),
  ])
  sendSuccess(res, { logs }, 200, { page: query.page, limit: query.limit, total })
}
