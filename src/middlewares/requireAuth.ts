import type { Request, Response, NextFunction } from 'express'
import '../types/express'
import { AppError } from '../utils/AppError'
import { ACCESS_COOKIE } from '../utils/authCookies'
import { verifyAccessToken } from '../utils/tokens'

// Sirf logged-in users aage ja sakte hain
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_COOKIE]
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Please log in')

  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, role: payload.role }
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again')
  }

  next()
}
