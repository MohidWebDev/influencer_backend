import { Router } from 'express'
import {
  createClaim,
  createNewProfileClaim,
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
// Profile na mile to talent khud bheje (chhupi rehti hai jab tak claim approve na ho)
router.post('/new-profile', requireRole('talent'), createNewProfileClaim)
router.get('/mine', listMyClaims)
router.get('/my-profile', getMyProfile)
router.post('/:id/verify', verifyClaimCode)

export default router
