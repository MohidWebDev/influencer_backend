import { Router } from 'express'
import {
  createPerson,
  deletePerson,
  getPersonBySlug,
  listPeople,
  updatePerson,
} from '../controllers/peopleController'
import { cachePublic } from '../middlewares/cachePublic'
import { audit } from '../middlewares/audit'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'
import { validate } from '../middlewares/validate'
import { createPersonSchema } from '../validators/personValidator'
import { getPersonSnapshot } from '../services/auditSnapshots'

const router = Router()

router.get('/', cachePublic(60), listPeople)
router.get('/:slug', cachePublic(60), getPersonBySlug)
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validate(createPersonSchema),
  audit({ action: 'person.create', targetType: 'person', pickTarget: (d) => d.person }),
  createPerson,
)
router.patch(
  '/:id',
  requireAuth,
  audit({
    action: 'person.update',
    targetType: 'person',
    pickTarget: (d) => d.person,
    loadBefore: (req) => getPersonSnapshot(String(req.params.id)),
    // Owner ki apni edit admin action nahi
    when: (req) => req.user?.role === 'admin',
  }),
  updatePerson,
)
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  audit({
    action: 'person.delete',
    targetType: 'person',
    pickTarget: () => null,
    loadBefore: (req) => getPersonSnapshot(String(req.params.id)),
  }),
  deletePerson,
)

export default router
