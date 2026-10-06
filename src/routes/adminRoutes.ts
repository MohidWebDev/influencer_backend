import { Router } from 'express'
import { adminGetPerson, adminListPeople } from '../controllers/adminController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Is file ki har route sirf admin ke liye hai
const router = Router()

router.use(requireAuth, requireRole('admin'))

router.get('/people', adminListPeople)
router.get('/people/:id', adminGetPerson)

export default router
