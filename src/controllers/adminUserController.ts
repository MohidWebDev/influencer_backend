import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter } from 'mongoose'
import '../types/express'
import { User, type IUser } from '../models/User'
import { writeAuditLog } from '../services/auditService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  listUsersQuerySchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from '../validators/adminManagementValidator'

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function findTargetUser(req: Request) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'User not found')
  // Admin khud ko suspend ya demote na kar sake
  if (id === req.user!.id) {
    throw new AppError(403, 'CANNOT_MODIFY_SELF', 'You cannot change your own account here')
  }
  const user = await User.findById(id).select('+tokenVersion')
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found')
  return user
}

// Platform pe kam se kam ek active admin hamesha rahe
async function assertAnotherActiveAdmin(excludeId: unknown) {
  const others = await User.countDocuments({ role: 'admin', status: 'active', _id: { $ne: excludeId } })
  if (others === 0) {
    throw new AppError(409, 'LAST_ADMIN', 'At least one active admin must remain')
  }
}

const snapshot = (user: { role: string; status: string }) => ({ role: user.role, status: user.status })

// GET /api/admin/users -> search, role aur status filter
export async function adminListUsers(req: Request, res: Response) {
  const query = parseOrThrow(listUsersQuerySchema, req.query)
  const filter: QueryFilter<IUser> = {}
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i')
    filter.$or = [{ name: pattern }, { email: pattern }]
  }
  if (query.role) filter.role = query.role
  if (query.status) filter.status = query.status

  const skip = (query.page - 1) * query.limit
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: 1 }).skip(skip).limit(query.limit),
    User.countDocuments(filter),
  ])
  sendSuccess(res, { users }, 200, { page: query.page, limit: query.limit, total })
}

// PATCH /api/admin/users/:id/status -> suspend / unsuspend
export async function adminUpdateUserStatus(req: Request, res: Response) {
  const { status } = parseOrThrow(updateUserStatusSchema, req.body ?? {})
  const user = await findTargetUser(req)
  const before = snapshot(user)

  if (status === 'suspended' && user.role === 'admin' && user.status === 'active') {
    await assertAnotherActiveAdmin(user._id)
  }

  user.status = status
  // Suspend karne pe us ke saare refresh tokens bekaar
  if (status === 'suspended') user.tokenVersion += 1
  await user.save()

  await writeAuditLog(req, {
    action: status === 'suspended' ? 'user.suspend' : 'user.unsuspend',
    targetType: 'user',
    targetId: user._id,
    targetLabel: user.email,
    before,
    after: snapshot(user),
  })
  sendSuccess(res, { user })
}

// PATCH /api/admin/users/:id/role -> role badlo
export async function adminUpdateUserRole(req: Request, res: Response) {
  const { role } = parseOrThrow(updateUserRoleSchema, req.body ?? {})
  const user = await findTargetUser(req)
  const before = snapshot(user)
  if (user.role === role) return sendSuccess(res, { user })

  if (user.role === 'admin' && user.status === 'active') {
    await assertAnotherActiveAdmin(user._id)
  }

  user.role = role
  // Naya role naye login pe token mein aayega
  user.tokenVersion += 1
  await user.save()

  await writeAuditLog(req, {
    action: 'user.role_change',
    targetType: 'user',
    targetId: user._id,
    targetLabel: user.email,
    before,
    after: snapshot(user),
  })
  sendSuccess(res, { user })
}
