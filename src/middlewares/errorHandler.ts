import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/AppError'
import { sendError } from '../utils/apiResponse'
import { isProduction } from '../config/env'

// Saare errors aakhir mein yahan aate hain
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message, err.fields)
  }

  console.error(err)
  const message = isProduction ? 'Something went wrong' : err.message
  return sendError(res, 500, 'INTERNAL_ERROR', message)
}
