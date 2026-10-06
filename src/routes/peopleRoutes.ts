import { Router } from 'express'
import {
  createPerson,
  getPersonBySlug,
  listPeople,
  updatePerson,
} from '../controllers/peopleController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'
import { validate } from '../middlewares/validate'
import { createPersonSchema } from '../validators/personValidator'

const router = Router()

router.get('/', listPeople)
router.get('/:slug', getPersonBySlug)
router.post('/', requireAuth, requireRole('admin'), validate(createPersonSchema), createPerson)
router.patch('/:id', requireAuth, updatePerson)

export default router
