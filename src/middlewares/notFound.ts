import type { Request, Response } from 'express'
import { sendError } from '../utils/apiResponse'

// Jab koi route match na ho
export function notFound(req: Request, res: Response) {
  sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`)
}
