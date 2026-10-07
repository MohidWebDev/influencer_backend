import { Router } from 'express'
import { adminGetClaim } from '../controllers/adminClaimDetailController'
import {
  adminGetReport,
  adminListReports,
  adminUpdateReport,
} from '../controllers/adminReportController'
import { adminGetStats } from '../controllers/adminStatsController'
import {
  adminListUsers,
  adminUpdateUserRole,
  adminUpdateUserStatus,
} from '../controllers/adminUserController'
import { adminListAuditLogs } from '../controllers/auditLogController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Admin panel ke naye routes. Har route sirf admin ke liye
const router = Router()

router.use(requireAuth, requireRole('admin'))

router.get('/stats', adminGetStats)
router.get('/claims/:id', adminGetClaim)

router.get('/users', adminListUsers)
router.patch('/users/:id/status', adminUpdateUserStatus)
router.patch('/users/:id/role', adminUpdateUserRole)

router.get('/reports', adminListReports)
router.get('/reports/:id', adminGetReport)
router.patch('/reports/:id', adminUpdateReport)

router.get('/audit-logs', adminListAuditLogs)

export default router
