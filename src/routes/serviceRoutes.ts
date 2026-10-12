import { Router } from 'express'
import {
  createService,
  deleteService,
  getMyServices,
  updateAvailability,
  updateService,
} from '../controllers/serviceController'
import { listIncomingHires, respondHire } from '../controllers/hireController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Talent apni profile ki services, availability aur aayi hui hire requests yahan sambhalta hai.
// Manager bhi, talent ki ijazat se, ?person=<profile id> laga kar (hire requests bina person ke = sab talents ki)
const router = Router()

router.use(requireAuth, requireRole('talent', 'representative'))
router.get('/services', getMyServices)
router.post('/services', createService)
router.patch('/services/:id', updateService)
router.delete('/services/:id', deleteService)
router.put('/availability', updateAvailability)
router.get('/hire-requests', listIncomingHires)
router.patch('/hire-requests/:id', respondHire)

export default router
