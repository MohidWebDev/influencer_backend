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
  // Error wala jawab kabhi cache na ho
  res.set('Cache-Control', 'no-store')

  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message, err.fields)
  }

  // Ghalat JSON body (express.json parse nahi kar saka)
  if (err instanceof SyntaxError && 'body' in err) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON')
  }

  // MongoDB duplicate key (jaise wahi email dobara)
  if ((err as { code?: number }).code === 11000) {
    return sendError(res, 409, 'DUPLICATE', 'This record already exists')
  }

  console.error(err)
  const message = isProduction ? 'Something went wrong' : err.message
  return sendError(res, 500, 'INTERNAL_ERROR', message)
}
