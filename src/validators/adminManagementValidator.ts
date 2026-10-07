import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { AUDIT_TARGET_TYPES } from '../models/AuditLog'
import { REPORT_REASONS, REPORT_STATUSES } from '../models/Report'
import { ROLES } from '../constants/roles'

const page = z.coerce.number().int().min(1).default(1)
const limit = z.coerce.number().int().min(1).max(50).default(20)

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page,
  limit,
})

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
})

export const updateUserRoleSchema = z.object({
  role: z.enum(ROLES),
})

export const listReportsQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  reason: z.enum(REPORT_REASONS).optional(),
  page,
  limit,
})

export const updateReportSchema = z.object({
  // Report wapas "open" nahi hoti
  status: z.enum(['reviewing', 'resolved', 'rejected']),
  adminNote: z.string().trim().max(1000).optional(),
  // Takedown: profile ko public site se chhupa do
  hidePerson: z.boolean().optional(),
})

export const listAuditLogsQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  targetId: z.string().refine(isValidObjectId, 'Invalid id').optional(),
  actor: z.string().refine(isValidObjectId, 'Invalid id').optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page,
  limit,
})
