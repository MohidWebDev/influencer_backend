import type { Request, Response } from 'express'
import { isValidObjectId, Types } from 'mongoose'
import { z } from 'zod'
import '../types/express'
import { CATEGORY_NAMES, NOTIFICATION_CATEGORIES, categoryOf } from '../constants/notifications'
import { Notification } from '../models/Notification'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(['true', 'false']).optional(),
  category: z.enum(CATEGORY_NAMES).optional(),
})

const typesOf = (category?: (typeof CATEGORY_NAMES)[number]) =>
  category ? { type: { $in: [...NOTIFICATION_CATEGORIES[category]] } } : {}

// Har category mein kitni notifications aur kitni unread (tabs ke liye; khali category nahi aati)
async function categoryCounts(recipient: string) {
  const rows = await Notification.aggregate<{ _id: string; total: number; unread: number }>([
    { $match: { recipient: new Types.ObjectId(recipient) } },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        unread: { $sum: { $cond: [{ $eq: ['$readAt', null] }, 1, 0] } },
      },
    },
  ])
  const counts: Record<string, { total: number; unread: number }> = {}
  for (const row of rows) {
    const category = categoryOf(row._id)
    if (!category) continue
    counts[category] ??= { total: 0, unread: 0 }
    counts[category].total += row.total
    counts[category].unread += row.unread
  }
  return counts
}

// GET /api/notifications -> meri notifications, naye pehle (?category= se ek hi qism).
// Saath mein kul unread aur har category ki ginti
export async function listNotifications(req: Request, res: Response) {
  const query = parseOrThrow(listQuerySchema, req.query)
  const recipient = req.user!.id
  const filter = {
    recipient,
    ...typesOf(query.category),
    ...(query.unread === 'true' && { readAt: null }),
  }

  const [notifications, total, unread, categories] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient, readAt: null }),
    categoryCounts(recipient),
  ])

  sendSuccess(res, { notifications, unread, categories }, 200, {
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

// POST /api/notifications/read-all -> sab parh li (?category= ho to sirf us qism ki)
export async function markAllRead(req: Request, res: Response) {
  const { category } = parseOrThrow(listQuerySchema.pick({ category: true }), req.query)
  const result = await Notification.updateMany(
    { recipient: req.user!.id, readAt: null, ...typesOf(category) },
    { $set: { readAt: new Date() } },
  )
  sendSuccess(res, { updated: result.modifiedCount })
}
