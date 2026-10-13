import { Router } from 'express'
import {
  approveMilestone,
  cancelAgreement,
  createAgreement,
  deliverMilestone,
  getAgreement,
  listMyAgreements,
  openDispute,
  reviewAgreement,
  sendSignCode,
  signAgreement,
  updateTerms,
} from '../controllers/agreementController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'
import { otpLimiter } from '../middlewares/rateLimit'

// Business aur talent ka muahida: shartein, sign, milestones, dispute, review.
// Talent ka manager (hire / muahide ki ijazat ke saath) talent ki jagah sab kar sakta hai
const router = Router()

router.use(requireAuth, requireRole('business', 'talent', 'representative'))
router.get('/', listMyAgreements)
router.post('/', requireRole('business'), createAgreement)
router.get('/:id', getAgreement)
router.put('/:id/terms', updateTerms)
router.post('/:id/sign/code', otpLimiter, sendSignCode)
router.post('/:id/sign', otpLimiter, signAgreement)
router.post('/:id/cancel', cancelAgreement)
router.post('/:id/milestones/:index/deliver', deliverMilestone)
router.post('/:id/milestones/:index/approve', approveMilestone)
router.post('/:id/dispute', openDispute)
router.post('/:id/review', reviewAgreement)

export default router
