import type { Request, Response, NextFunction } from 'express'
import '../types/express'
import type { Role } from '../constants/roles'
import { AppError } from '../utils/AppError'

// requireAuth ke baad lagta hai: requireRole('business', 'admin')
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in')
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this')
    }
    next()
  }
}
