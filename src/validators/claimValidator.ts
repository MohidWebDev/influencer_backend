import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { CLAIM_STATUSES } from '../models/ProfileClaim'

export const createClaimSchema = z.object({
  personId: z.string().refine(isValidObjectId, 'Invalid profile'),
  contactEmail: z.union([z.email('Enter a valid email').trim().toLowerCase(), z.literal('')]).optional(),
  // Kam se kam ek official link chahiye, wahin code DM hoga
  links: z
    .array(z.url('Enter a valid URL'))
    .min(1, 'Add at least one official account link so we can send you a code')
    .max(5),
  note: z.string().trim().max(1000).optional(),
})

export const sendCodeSchema = z.object({
  channelUrl: z.url('Choose one of the links'),
})

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const reviewClaimSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
})

export const adminListClaimsQuerySchema = z.object({
  // open = jo abhi chal rahe hain, needs_action = jin pe admin ko kuch karna hai
  status: z.enum([...CLAIM_STATUSES, 'open', 'needs_action']).default('open'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type CreateClaimInput = z.infer<typeof createClaimSchema>
