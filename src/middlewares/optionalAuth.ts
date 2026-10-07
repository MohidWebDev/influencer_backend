import type { Request, Response, NextFunction } from 'express'
import '../types/express'
import { ACCESS_COOKIE } from '../utils/authCookies'
import { verifyAccessToken } from '../utils/tokens'

// Login ho to req.user set karo, na ho to bhi aage jane do
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_COOKIE]
  if (token) {
    try {
      const payload = verifyAccessToken(token)
      req.user = { id: payload.sub, role: payload.role }
    } catch {
      // Purana token: guest ki tarah chalo
    }
  }
  next()
}
