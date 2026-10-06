import type { Request, Response, NextFunction } from 'express'
import type { ZodType } from 'zod'
import { AppError } from '../utils/AppError'

// Request body ko Zod schema se check karta hai
export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {})

    if (!result.success) {
      const fields: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || 'body'
        if (!fields[key]) fields[key] = issue.message
      }
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', fields)
    }

    // Saaf kiya hua data (trim, lowercase) aage bhejo
    req.body = result.data
    next()
  }
}
