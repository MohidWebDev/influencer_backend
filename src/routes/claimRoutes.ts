import { Router } from 'express'
import {
  createClaim,
  getMyProfile,
  listMyClaims,
  verifyClaimCode,
} from '../controllers/claimController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'
import { validate } from '../middlewares/validate'
import { createClaimSchema } from '../validators/claimValidator'

const router = Router()

router.use(requireAuth)

// Sirf talent account apni profile claim kar sakta hai
router.post('/', requireRole('talent'), validate(createClaimSchema), createClaim)
router.get('/mine', listMyClaims)
router.get('/my-profile', getMyProfile)
router.post('/:id/verify', verifyClaimCode)

export default router
