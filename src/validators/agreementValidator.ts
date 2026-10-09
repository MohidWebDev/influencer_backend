import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import {
  AGREEMENT_STATUSES,
  DISPUTE_OUTCOMES,
  MAX_MILESTONES,
  MAX_REVISIONS,
} from '../constants/agreements'
import { CURRENCIES } from '../constants/services'

const optionalText = (max: number) => z.string().trim().max(max).optional()

const milestoneSchema = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters').max(120),
  amount: z.coerce.number().int('Use a whole number').min(0).max(1_000_000_000),
  dueDate: z.coerce.date().optional().nullable(),
})

// Muahide ki shartein (business banata hai, dono badal sakte hain jab tak sign na ho)
export const termsSchema = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters').max(120),
  scope: z.string().trim().min(20, 'Describe the work (at least 20 characters)').max(3000),
  currency: z.enum(CURRENCIES),
  milestones: z
    .array(milestoneSchema)
    .min(1, 'Add at least one milestone')
    .max(MAX_MILESTONES, `Up to ${MAX_MILESTONES} milestones`),
  paymentTerms: optionalText(1000),
  usageRights: optionalText(1000),
  revisions: z.coerce.number().int().min(0).max(MAX_REVISIONS).default(2),
  cancellationTerms: optionalText(1000),
})

export const createAgreementSchema = z.object({
  hireId: z.string().refine(isValidObjectId, 'Invalid hire request'),
  terms: termsSchema,
})

export const updateTermsSchema = z.object({ terms: termsSchema })

export const signAgreementSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const cancelAgreementSchema = z.object({
  reason: optionalText(1000),
})

export const deliverMilestoneSchema = z.object({
  note: z.string().trim().min(3, 'Describe what you delivered').max(1000),
  link: z.union([z.url('Enter a valid URL'), z.literal('')]).optional(),
})

export const requestChangesSchema = z.object({
  note: z.string().trim().min(3, 'Explain what needs to change').max(1000),
})

export const disputeSchema = z.object({
  reason: z.string().trim().min(20, 'Explain the problem (at least 20 characters)').max(2000),
})

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5),
  comment: optionalText(1000),
})

export const resolveDisputeSchema = z.object({
  outcome: z.enum(DISPUTE_OUTCOMES),
  note: z.string().trim().min(3, 'Explain the decision').max(2000),
})

export const adminListAgreementsQuerySchema = z.object({
  status: z.enum(AGREEMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type AgreementTermsInput = z.infer<typeof termsSchema>
