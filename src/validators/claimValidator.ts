import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { CLAIM_STATUSES } from '../models/ProfileClaim'

export const createClaimSchema = z.object({
  personId: z.string().refine(isValidObjectId, 'Invalid profile'),
  contactEmail: z.union([z.email('Enter a valid email').trim().toLowerCase(), z.literal('')]).optional(),
  links: z.array(z.url('Enter a valid URL')).max(5).default([]),
  note: z
    .string()
    .trim()
    .min(10, 'Tell us in a few words how we can verify you (at least 10 characters)')
    .max(1000),
})

export const reviewClaimSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
})

export const adminListClaimsQuerySchema = z.object({
  status: z.enum(CLAIM_STATUSES).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type CreateClaimInput = z.infer<typeof createClaimSchema>
export type ReviewClaimInput = z.infer<typeof reviewClaimSchema>
