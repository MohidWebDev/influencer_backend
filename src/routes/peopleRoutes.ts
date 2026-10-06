import { Router } from 'express'
import {
  createPerson,
  getPersonBySlug,
  listPeople,
  updatePerson,
} from '../controllers/peopleController'
import { cachePublic } from '../middlewares/cachePublic'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'
import { validate } from '../middlewares/validate'
import { createPersonSchema } from '../validators/personValidator'

const router = Router()

router.get('/', cachePublic(60), listPeople)
router.get('/:slug', cachePublic(60), getPersonBySlug)
router.post('/', requireAuth, requireRole('admin'), validate(createPersonSchema), createPerson)
router.patch('/:id', requireAuth, updatePerson)

export default router
