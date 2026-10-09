import { Router } from 'express'
import {
  approveMilestone,
  cancelAgreement,
  createAgreement,
  deliverMilestone,
  getAgreement,
  listMyAgreements,
  openDispute,
  requestChanges,
  reviewAgreement,
  sendSignCode,
  signAgreement,
  updateTerms,
} from '../controllers/agreementController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Business aur talent ka muahida: shartein, sign, milestones, dispute, review
const router = Router()

router.use(requireAuth, requireRole('business', 'talent'))
router.get('/', listMyAgreements)
router.post('/', requireRole('business'), createAgreement)
router.get('/:id', getAgreement)
router.put('/:id/terms', updateTerms)
router.post('/:id/sign/code', sendSignCode)
router.post('/:id/sign', signAgreement)
router.post('/:id/cancel', cancelAgreement)
router.post('/:id/milestones/:index/deliver', deliverMilestone)
router.post('/:id/milestones/:index/approve', approveMilestone)
router.post('/:id/milestones/:index/request-changes', requestChanges)
router.post('/:id/dispute', openDispute)
router.post('/:id/review', reviewAgreement)

export default router
