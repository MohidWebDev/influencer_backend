import type { Request, Response } from 'express'
import { isValidObjectId, type QueryFilter } from 'mongoose'
import '../types/express'
import { NewsletterSubscriber, type INewsletterSubscriber } from '../models/NewsletterSubscriber'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  adminListSubscribersQuerySchema,
  subscribeSchema,
  unsubscribeSchema,
} from '../validators/newsletterValidator'

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// POST /api/newsletter/subscribe -> footer ka form. Jawab hamesha ek jaisa: koi ye na
// jaan sake ke koi email pehle se list mein hai ya nahi
export async function subscribe(req: Request, res: Response) {
  const { email, language } = parseOrThrow(subscribeSchema, req.body ?? {})
  const existing = await NewsletterSubscriber.findOne({ email })
  if (!existing) {
    await NewsletterSubscriber.create({ email, language })
  } else if (existing.status === 'unsubscribed') {
    // Dobara subscribe: wapas list mein
    existing.set({ status: 'subscribed', subscribedAt: new Date(), unsubscribedAt: undefined, language })
    await existing.save()
  }
  sendSuccess(res, { subscribed: true })
}

// POST /api/newsletter/unsubscribe -> email ke link wala token
export async function unsubscribe(req: Request, res: Response) {
  const { token } = parseOrThrow(unsubscribeSchema, req.body ?? {})
  const subscriber = await NewsletterSubscriber.findOne({ unsubscribeToken: token })
  if (!subscriber) throw new AppError(404, 'NOT_FOUND', 'This link is not valid')
  if (subscriber.status !== 'unsubscribed') {
    subscriber.set({ status: 'unsubscribed', unsubscribedAt: new Date() })
    await subscriber.save()
  }
  sendSuccess(res, { unsubscribed: true, email: subscriber.email })
}

function adminFilter(query: { status?: string; q?: string }) {
  const filter: QueryFilter<INewsletterSubscriber> = {}
  if (query.status) filter.status = query.status as INewsletterSubscriber['status']
  if (query.q) filter.email = new RegExp(escapeRegex(query.q), 'i')
  return filter
}

// GET /api/admin/newsletter -> subscribers ki list, naye pehle, aur ginti
export async function adminListSubscribers(req: Request, res: Response) {
  const query = parseOrThrow(adminListSubscribersQuerySchema, req.query)
  const filter = adminFilter(query)
  const skip = (query.page - 1) * query.limit
  const [subscribers, total, subscribed] = await Promise.all([
    NewsletterSubscriber.find(filter).sort({ subscribedAt: -1, _id: -1 }).skip(skip).limit(query.limit),
    NewsletterSubscriber.countDocuments(filter),
    NewsletterSubscriber.countDocuments({ status: 'subscribed' }),
  ])
  sendSuccess(res, { subscribers, subscribed }, 200, { page: query.page, limit: query.limit, total })
}

// CSV ki ek field: comma / quote / naye line wali qeemat quotes mein. Formula (=, +, -, @)
// se shuru ho to aage ' laga do, taake Excel use formula na samjhe
function csvField(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// GET /api/admin/newsletter/export -> sab subscribed emails CSV mein (mailing tool ke liye)
export async function adminExportSubscribers(_req: Request, res: Response) {
  const subscribers = await NewsletterSubscriber.find({ status: 'subscribed' }).sort({ subscribedAt: 1 })
  const rows = [
    'email,language,subscribed_at',
    ...subscribers.map((s) =>
      [s.email, s.language ?? '', s.subscribedAt.toISOString()].map(csvField).join(','),
    ),
  ]
  res.set('Content-Type', 'text/csv; charset=utf-8')
  res.set('Content-Disposition', 'attachment; filename="newsletter-subscribers.csv"')
  res.set('Cache-Control', 'no-store')
  res.send(rows.join('\n') + '\n')
}

// DELETE /api/admin/newsletter/:id -> email hamesha ke liye hatao (jaise koi kahe "mera data mita do")
export async function adminDeleteSubscriber(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Subscriber not found')
  const deleted = await NewsletterSubscriber.findByIdAndDelete(id)
  if (!deleted) throw new AppError(404, 'NOT_FOUND', 'Subscriber not found')
  sendSuccess(res, { deleted: true, id })
}
