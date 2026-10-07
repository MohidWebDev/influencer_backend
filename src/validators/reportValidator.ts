import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { REPORT_REASONS } from '../models/Report'

export const createReportSchema = z.object({
  personId: z.string().refine(isValidObjectId, 'Invalid profile'),
  reason: z.enum(REPORT_REASONS, 'Choose a reason'),
  details: z
    .string()
    .trim()
    .min(10, 'Please describe the problem (at least 10 characters)')
    .max(2000),
  reporterName: z.string().trim().max(100).optional(),
  reporterEmail: z.union([z.email('Enter a valid email').trim().toLowerCase(), z.literal('')]).optional(),
})

export type CreateReportInput = z.infer<typeof createReportSchema>
