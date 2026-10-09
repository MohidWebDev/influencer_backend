import type { Request, Response, NextFunction } from 'express'
import '../types/express'
import { BusinessProfile } from '../models/BusinessProfile'
import { AppError } from '../utils/AppError'

// requireAuth + requireRole('business') ke baad: sirf admin se approved business aage
export async function requireVerifiedBusiness(req: Request, _res: Response, next: NextFunction) {
  const business = await BusinessProfile.findOne({ owner: req.user!.id }).select('status')
  if (business?.status !== 'approved') {
    throw new AppError(
      403,
      'BUSINESS_NOT_VERIFIED',
      'Your business must be verified before you can hire talents',
    )
  }
  next()
}
