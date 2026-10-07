import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { AuditLog } from '../models/AuditLog'
import { ProfileClaim } from '../models/ProfileClaim'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'

// GET /api/admin/claims/:id -> ek claim: person, claimant, evidence + history
export async function adminGetClaim(req: Request, res: Response) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Claim not found')

  const claim = await ProfileClaim.findById(id).populate([
    { path: 'person', select: 'name slug headline photoUrl claimedBy status verified visibility' },
    { path: 'user', select: 'name email role status createdAt' },
    { path: 'reviewedBy', select: 'name email' },
    { path: 'verifiedBy', select: 'name email' },
  ])
  if (!claim) throw new AppError(404, 'NOT_FOUND', 'Claim not found')

  const history = await AuditLog.find({ targetType: 'claim', targetId: claim._id })
    .sort({ createdAt: -1 })
    .limit(50)
  sendSuccess(res, { claim, history })
}
