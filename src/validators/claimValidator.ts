import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { CLAIM_STATUSES } from '../models/ProfileClaim'
import { createPersonSchema } from './personValidator'

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

// Reset: link optional, na ho to pichla link
export const resetOtpSchema = z.object({
  channelUrl: z.url('Choose one of the links').optional(),
})

export const reviewClaimSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
})

export const adminListClaimsQuerySchema = z.object({
  // open = jo abhi chal rahe hain, needs_action = jin pe admin ko kuch karna hai, all = sab
  // new_profiles = talent ki khud bheji hui nayi profiles (khule claims)
  status: z.enum([...CLAIM_STATUSES, 'open', 'needs_action', 'all', 'new_profiles']).default('open'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

// Talent ko apni profile na mile to khud bhejta hai. Social links pe hi code jayega
export const newProfileClaimSchema = createPersonSchema
  .pick({
    name: true,
    headline: true,
    bio: true,
    photoUrl: true,
    websiteUrl: true,
    languages: true,
    country: true,
    city: true,
    professions: true,
    industries: true,
    topics: true,
  })
  .extend({
    socialAccounts: createPersonSchema.shape.socialAccounts.unwrap().min(1, 'Add at least one official social account so we can send you a code'),
    contactEmail: z.union([z.email('Enter a valid email').trim().toLowerCase(), z.literal('')]).optional(),
    note: z.string().trim().max(1000).optional(),
    // Milti julti profile mili ho aur talent phir bhi nayi banana chahe
    force: z.boolean().optional(),
  })

export type CreateClaimInput = z.infer<typeof createClaimSchema>
export type NewProfileClaimInput = z.infer<typeof newProfileClaimSchema>
