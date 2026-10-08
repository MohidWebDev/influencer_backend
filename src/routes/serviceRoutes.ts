import { Router } from 'express'
import {
  createService,
  deleteService,
  getMyServices,
  updateAvailability,
  updateService,
} from '../controllers/serviceController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Talent apni profile ki services aur availability yahan sambhalta hai
const router = Router()

router.use(requireAuth, requireRole('talent'))
router.get('/services', getMyServices)
router.post('/services', createService)
router.patch('/services/:id', updateService)
router.delete('/services/:id', deleteService)
router.put('/availability', updateAvailability)

export default router
