import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { BUSINESS_STATUSES, COMPANY_SIZES, HIRE_CURRENCIES } from '../constants/business'

const optionalText = (max: number) => z.string().trim().max(max).optional()

// Business apni company ki details bhejta hai (pehli dafa ya dobara)
export const businessProfileSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters').max(120),
  industry: optionalText(80),
  companySize: z.union([z.enum(COMPANY_SIZES), z.literal('')]).optional(),
  description: optionalText(1000),
  websiteUrl: z.url('Enter a valid URL').trim(),
  registrationNumber: optionalText(60),
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
  proofLinks: z
    .array(z.url('Enter a valid URL'))
    .max(5)
    .default([])
    .transform((list) => [...new Set(list)]),
})

export const createHireSchema = z.object({
  personId: z.string().refine(isValidObjectId, 'Invalid profile'),
  serviceId: z.string().refine(isValidObjectId, 'Invalid service').optional(),
  title: z.string().trim().min(3, 'Use at least 3 characters').max(120),
  message: z.string().trim().min(20, 'Tell the talent a bit more (at least 20 characters)').max(2000),
  budget: z
    .object({
      amount: z.coerce.number().int('Use a whole number').min(1, 'Enter an amount').max(1_000_000_000),
      currency: z.enum(HIRE_CURRENCIES),
    })
    .optional(),
  startDate: z.coerce.date().optional(),
})

export const respondHireSchema = z.object({
  action: z.enum(['accept', 'decline']),
  note: z.string().trim().max(500).optional(),
})

export const reviewBusinessSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
})

export const adminListBusinessesQuerySchema = z.object({
  status: z.enum(BUSINESS_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>
export type CreateHireInput = z.infer<typeof createHireSchema>
