import type { Request, Response, NextFunction } from 'express'
import type { ZodType } from 'zod'
import { parseOrThrow } from '../utils/validation'

// Request body ko Zod schema se check karta hai
export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Saaf kiya hua data (trim, lowercase) aage bhejo
    req.body = parseOrThrow(schema, req.body ?? {})
    next()
  }
}
