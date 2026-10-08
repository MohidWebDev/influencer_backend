import { z } from 'zod'
import {
  CURRENCIES,
  OPEN_TO,
  PRICE_UNITS,
  RESPONSE_TIMES,
  SERVICE_CATEGORIES,
} from '../constants/services'

const money = z.coerce.number().int('Use a whole number').min(1, 'Enter an amount').max(1_000_000_000)

// Keemat ki teen shaklen; har shakal ke apne zaroori fields
const pricingSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('fixed'),
    currency: z.enum(CURRENCIES),
    unit: z.enum(PRICE_UNITS),
    amount: money,
  }),
  z
    .object({
      type: z.literal('range'),
      currency: z.enum(CURRENCIES),
      unit: z.enum(PRICE_UNITS),
      min: money,
      max: money,
    })
    .refine((p) => p.max > p.min, { path: ['max'], message: 'Must be more than the minimum' }),
  z.object({
    type: z.literal('quote'),
    currency: z.enum(CURRENCIES).default('PKR'),
    unit: z.enum(PRICE_UNITS).default('project'),
  }),
])

export const serviceSchema = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters').max(80),
  category: z.enum(SERVICE_CATEGORIES, 'Choose a type'),
  description: z.string().trim().max(500).optional(),
  pricing: pricingSchema,
  deliveryDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  isActive: z.boolean().default(true),
})

// PATCH: sab optional (jaise sirf isActive badalna)
export const updateServiceSchema = serviceSchema.partial()

export const availabilitySchema = z.object({
  isOpen: z.boolean(),
  openTo: z.array(z.enum(OPEN_TO)).max(OPEN_TO.length).transform((list) => [...new Set(list)]),
  responseTime: z.enum(RESPONSE_TIMES).optional().nullable(),
  availableFrom: z.coerce.date().optional().nullable(),
  note: z.string().trim().max(280).optional(),
})

export type ServiceInput = z.infer<typeof serviceSchema>
export type AvailabilityInput = z.infer<typeof availabilitySchema>
