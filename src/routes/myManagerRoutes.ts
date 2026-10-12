import { Router } from 'express'
import {
  getMyManager,
  inviteManager,
  talentEnd,
  talentRespond,
  updatePermissions,
} from '../controllers/representationController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Talent ka manager: bulana, darkhwast ka jawab, ijazat badalna, rishta khatam karna
const router = Router()

router.use(requireAuth, requireRole('talent'))
router.get('/', getMyManager)
router.post('/invite', inviteManager)
router.post('/:id/respond', talentRespond)
router.patch('/:id', updatePermissions)
router.post('/:id/end', talentEnd)

export default router
