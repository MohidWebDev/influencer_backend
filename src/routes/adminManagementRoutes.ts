import { Router } from 'express'
import { adminGetClaim } from '../controllers/adminClaimDetailController'
import {
  adminGetAgreement,
  adminListAgreements,
  adminResolveDispute,
} from '../controllers/agreementController'
import {
  adminGetBusiness,
  adminListBusinesses,
  adminResetBusinessOtp,
  adminReviewBusiness,
  adminSendBusinessCode,
  adminVerifyBusinessManually,
} from '../controllers/businessController'
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

router.get('/businesses', adminListBusinesses)
router.get('/businesses/:id', adminGetBusiness)
router.post('/businesses/:id/code', adminSendBusinessCode)
router.post('/businesses/:id/reset-otp', adminResetBusinessOtp)
router.post('/businesses/:id/verify-manual', adminVerifyBusinessManually)
router.patch('/businesses/:id', adminReviewBusiness)

router.get('/agreements', adminListAgreements)
router.get('/agreements/:id', adminGetAgreement)
router.post('/agreements/:id/resolve', adminResolveDispute)

router.get('/audit-logs', adminListAuditLogs)

export default router
