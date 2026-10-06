import { Router } from 'express'
import { adminGetPerson, adminListPeople } from '../controllers/adminController'
import { adminListClaims, adminReviewClaim } from '../controllers/claimController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Is file ki har route sirf admin ke liye hai
const router = Router()

router.use(requireAuth, requireRole('admin'))

router.get('/people', adminListPeople)
router.get('/people/:id', adminGetPerson)
router.get('/claims', adminListClaims)
router.patch('/claims/:id', adminReviewClaim)

export default router
