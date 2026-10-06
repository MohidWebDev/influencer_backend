import type { ZodType, z } from 'zod'
import { AppError } from './AppError'

// Zod se data check karta hai. Ghalat ho to VALIDATION_ERROR throw karta hai
export function parseOrThrow<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)

  if (!result.success) {
    const fields: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'body'
      if (!fields[key]) fields[key] = issue.message
    }
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', fields)
  }

  return result.data
}
