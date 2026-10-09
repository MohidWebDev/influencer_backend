import { Router } from 'express'
import { getMyBusiness, saveMyBusiness } from '../controllers/businessController'
import { cancelHire, createHire, listMyHires } from '../controllers/hireController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'
import { requireVerifiedBusiness } from '../middlewares/requireVerifiedBusiness'

// Business account: company verification aur talents ko hire karna
const router = Router()

router.use(requireAuth, requireRole('business'))
router.get('/profile', getMyBusiness)
router.put('/profile', saveMyBusiness)
router.get('/hires', listMyHires)
// Hire sirf admin se verified business kar sakta hai
router.post('/hires', requireVerifiedBusiness, createHire)
router.post('/hires/:id/cancel', cancelHire)

export default router
