import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import '../types/express'
import { Notification } from '../models/Notification'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(['true', 'false']).optional(),
})

// GET /api/notifications -> meri notifications, naye pehle. meta mein unread ginti bhi
export async function listNotifications(req: Request, res: Response) {
  const query = parseOrThrow(listQuerySchema, req.query)
  const recipient = req.user!.id
  const filter = { recipient, ...(query.unread === 'true' && { readAt: null }) }

  const [notifications, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient, readAt: null }),
  ])

  sendSuccess(res, { notifications, unread }, 200, {
    page: query.page,
    limit: query.limit,
    total,
  })
}

// GET /api/notifications/unread-count -> bell pe ginti
export async function unreadCount(req: Request, res: Response) {
  const unread = await Notification.countDocuments({ recipient: req.user!.id, readAt: null })
  sendSuccess(res, { unread })
}

// PATCH /api/notifications/:id/read -> ek parh li (sirf apni)
export async function markRead(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Notification not found')
  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: req.user!.id },
    { $set: { readAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!notification) throw new AppError(404, 'NOT_FOUND', 'Notification not found')
  sendSuccess(res, { notification })
}

// POST /api/notifications/read-all -> sab parh li
export async function markAllRead(req: Request, res: Response) {
  const result = await Notification.updateMany(
    { recipient: req.user!.id, readAt: null },
    { $set: { readAt: new Date() } },
  )
  sendSuccess(res, { updated: result.modifiedCount })
}
