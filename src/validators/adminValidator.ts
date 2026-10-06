import { z } from 'zod'

export const adminListPeopleQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  visibility: z.enum(['visible', 'hidden']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
