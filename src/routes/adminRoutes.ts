import { Router } from 'express'
import { adminGetPerson, adminListPeople } from '../controllers/adminController'
import {
  adminListClaims,
  adminResetClaimOtp,
  adminReviewClaim,
  adminSendClaimCode,
  adminVerifyClaimManually,
} from '../controllers/claimController'
import { audit } from '../middlewares/audit'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'
import { getClaimSnapshot } from '../services/auditSnapshots'
import adminManagementRoutes from './adminManagementRoutes'

// Is file ki har route sirf admin ke liye hai
const router = Router()

// Claim actions ka audit log
const auditClaim = (action: Parameters<typeof audit>[0]['action']) =>
  audit({
    action,
    targetType: 'claim',
    pickTarget: (data) => data.claim,
    loadBefore: (req) => getClaimSnapshot(String(req.params.id)),
  })

router.use(requireAuth, requireRole('admin'))

router.get('/people', adminListPeople)
router.get('/people/:id', adminGetPerson)
router.get('/claims', adminListClaims)
router.post('/claims/:id/code', auditClaim('claim.send_code'), adminSendClaimCode)
router.post('/claims/:id/reset-otp', auditClaim('claim.reset_otp'), adminResetClaimOtp)
router.post('/claims/:id/verify-manual', auditClaim('claim.verify_manual'), adminVerifyClaimManually)
router.patch(
  '/claims/:id',
  auditClaim((req) => `claim.${req.body?.action === 'approve' ? 'approve' : 'reject'}`),
  adminReviewClaim,
)

// Users, reports, audit log, stats
router.use(adminManagementRoutes)

export default router
