import type { Request, Response } from 'express'
import { ProfileClaim } from '../models/ProfileClaim'
import { Report } from '../models/Report'
import { User } from '../models/User'
import { getPeopleStats } from '../services/personModerationService'
import { sendSuccess } from '../utils/apiResponse'

// GET /api/admin/stats -> admin dashboard ke numbers
export async function adminGetStats(_req: Request, res: Response) {
  const [people, usersByRole, suspended, claimsNeedAction, claimsOpen, reportsOpen, reportsReviewing] =
    await Promise.all([
      getPeopleStats(),
      User.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.countDocuments({ status: 'suspended' }),
      ProfileClaim.countDocuments({ status: { $in: ['pending', 'code_verified'] } }),
      ProfileClaim.countDocuments({ status: { $in: ['pending', 'code_sent', 'code_verified'] } }),
      Report.countDocuments({ status: 'open' }),
      Report.countDocuments({ status: 'reviewing' }),
    ])

  const byRole = Object.fromEntries(usersByRole.map((r) => [r._id, r.count]))
  const totalUsers = usersByRole.reduce((sum, r) => sum + r.count, 0)

  sendSuccess(res, {
    people,
    users: { total: totalUsers, suspended, byRole },
    claims: { needsAction: claimsNeedAction, open: claimsOpen },
    reports: { open: reportsOpen, reviewing: reportsReviewing },
  })
}
