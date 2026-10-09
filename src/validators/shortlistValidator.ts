import { isValidObjectId } from 'mongoose'
import { z } from 'zod'

export const createShortlistSchema = z.object({
  name: z.string().trim().min(1, 'Give the list a name').max(80),
  description: z.string().trim().max(300).optional(),
})

export const updateShortlistSchema = createShortlistSchema.partial()

export const addItemSchema = z.object({
  personId: z.string().refine(isValidObjectId, 'Invalid profile'),
  note: z.string().trim().max(1000).optional(),
})

export const updateItemSchema = z.object({
  note: z.string().trim().max(1000),
})
