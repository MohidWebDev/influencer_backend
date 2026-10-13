import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { webUrl } from './common'
import { MANAGER_STATUSES, REPRESENTATION_STATUSES } from '../constants/manager'
import { SOCIAL_PLATFORMS } from '../constants/people'

const optionalText = (max: number) => z.string().trim().max(max).optional()

// Manager apni professional details bhejta hai (pehli dafa ya dobara)
export const managerProfileSchema = z.object({
  agencyName: optionalText(120),
  // Website optional; kam az kam ek social account zaroori (tasdeeq aur raabte ke liye)
  websiteUrl: z
    .union([webUrl('Enter a valid URL'), z.literal('')])
    .optional()
    .transform((url) => url || undefined),
  socialAccounts: z
    .array(
      z.object({
        platform: z.enum(SOCIAL_PLATFORMS, 'Choose a platform'),
        url: webUrl('Enter a valid URL'),
      }),
    )
    .min(1, 'Add at least one social account')
    .max(10),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Choose a country')
    .transform((c) => c.toUpperCase()),
  city: optionalText(80),
  contactPhone: z
    .union([
      z
        .string()
        .trim()
        .regex(/^\+?[0-9 ()-]{6,30}$/, 'Enter a valid phone number'),
      z.literal(''),
    ])
    .optional(),
  bio: optionalText(1000),
  talentsCount: z.coerce.number().int('Use a whole number').min(0).max(10000).optional(),
  proofLinks: z
    .array(webUrl('Enter a valid URL'))
    .max(5)
    .default([])
    .transform((list) => [...new Set(list)]),
})

export const reviewManagerSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
})

export const adminListManagersQuerySchema = z.object({
  status: z.enum(MANAGER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const permissionsSchema = z.object({
  manageProfile: z.boolean().default(false),
  handleHires: z.boolean().default(false),
})

// Talent manager ko bulata hai (manager ke login email se)
export const inviteManagerSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  message: optionalText(1000),
  permissions: permissionsSchema.default({ manageProfile: false, handleHires: false }),
})

// Manager talent ko represent karne ki darkhwast karta hai
export const requestRepresentationSchema = z.object({
  personId: z.string().refine(isValidObjectId, 'Invalid profile'),
  message: optionalText(1000),
})

// Talent manager ki darkhwast ka jawab deta hai (haan pe ijazat bhi chunta hai)
export const talentRespondSchema = z.object({
  action: z.enum(['accept', 'decline']),
  permissions: permissionsSchema.optional(),
})

export const managerRespondSchema = z.object({
  action: z.enum(['accept', 'decline']),
})

export const updatePermissionsSchema = z.object({
  permissions: permissionsSchema,
})

export const listRepresentationsQuerySchema = z.object({
  status: z.enum(REPRESENTATION_STATUSES).optional(),
})

// Talent apne manager ko review deta hai
export const reviewManagerByTalentSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars'),
  comment: z.string().trim().max(1000).optional(),
})
