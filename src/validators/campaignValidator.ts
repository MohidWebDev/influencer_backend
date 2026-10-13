import { z } from 'zod'
import { HIRE_CURRENCIES } from '../constants/business'
import { MAX_CAMPAIGN_SLOTS } from '../constants/campaigns'
import { SERVICE_CATEGORIES } from '../constants/services'

const campaignFields = {
  title: z.string().trim().min(3, 'Use at least 3 characters').max(120),
  brief: z
    .string()
    .trim()
    .min(30, 'Describe the campaign in at least 30 characters')
    .max(3000, 'Use at most 3000 characters'),
  category: z.enum(SERVICE_CATEGORIES, 'Choose a category'),
  // null = budget hatao
  budget: z
    .object({
      amount: z.coerce.number().int('Use a whole number').min(1, 'Enter an amount').max(1_000_000_000),
      currency: z.enum(HIRE_CURRENCIES),
    })
    .nullable()
    .optional(),
  // '' = kisi bhi mulk ka talent
  country: z
    .union([z.string().trim().regex(/^[A-Za-z]{2}$/, 'Choose a country'), z.literal('')])
    .optional()
    .transform((c) => (c ? c.toUpperCase() : c)),
  // null / '' = koi aakhri tareekh nahi
  deadline: z
    .union([z.coerce.date('Choose a valid date'), z.literal(''), z.null()])
    .optional()
    .transform((d) => (d === '' ? null : d)),
  slots: z.coerce
    .number()
    .int('Use a whole number')
    .min(1, 'At least 1')
    .max(MAX_CAMPAIGN_SLOTS, `At most ${MAX_CAMPAIGN_SLOTS}`)
    .default(1),
}

// Aakhri tareekh aaj ya baad ki ho
const futureDeadline = (deadline: Date | null | undefined) => {
  if (!deadline) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return deadline >= today
}

export const createCampaignSchema = z
  .object({ ...campaignFields, status: z.enum(['draft', 'open']).default('open') })
  .refine((v) => futureDeadline(v.deadline), {
    path: ['deadline'],
    message: 'The deadline has to be today or later',
  })

export const updateCampaignSchema = z
  .object({
    ...campaignFields,
    slots: campaignFields.slots.optional(),
    status: z.enum(['draft', 'open', 'closed']),
  })
  .partial()
  .refine((v) => futureDeadline(v.deadline), {
    path: ['deadline'],
    message: 'The deadline has to be today or later',
  })

export const listCampaignsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((c) => c.toUpperCase())
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
})

export const applySchema = z.object({
  pitch: z
    .string()
    .trim()
    .min(20, 'Tell the business a bit more (at least 20 characters)')
    .max(1000, 'Use at most 1000 characters'),
})

export const respondApplicationSchema = z.object({
  action: z.enum(['accept', 'reject']),
})

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>
