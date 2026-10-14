import { z } from 'zod'
import { NEWSLETTER_STATUSES } from '../models/NewsletterSubscriber'

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  language: z.enum(['en', 'ur', 'ar']).optional(),
})

export const unsubscribeSchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{48}$/, 'This link is not valid'),
})

export const adminListSubscribersQuerySchema = z.object({
  status: z.enum(NEWSLETTER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})
