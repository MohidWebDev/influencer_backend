import { Router, type Request } from 'express'
import {
  createPerson,
  deletePerson,
  getPersonBySlug,
  getPersonPhoto,
  listPeople,
  updatePerson,
} from '../controllers/peopleController'
import { listPersonReviews } from '../controllers/agreementController'
import { cachePublic } from '../middlewares/cachePublic'
import { audit } from '../middlewares/audit'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'
import { validate } from '../middlewares/validate'
import { createPersonSchema } from '../validators/personValidator'
import { getPersonSnapshot } from '../services/auditSnapshots'

const router = Router()

// Sirf verified ya sirf visibility badli ho to us ka apna naam, warna "person.update"
function personUpdateAction(req: Request) {
  const body = (req.body ?? {}) as { verified?: boolean; visibility?: string }
  const keys = Object.keys(body)
  if (keys.length === 1 && keys[0] === 'verified') {
    return body.verified ? 'person.verify' : 'person.unverify'
  }
  if (keys.length === 1 && keys[0] === 'visibility') {
    return body.visibility === 'hidden' ? 'person.hide' : 'person.unhide'
  }
  return 'person.update'
}

// Mehman: CDN ka jawab zyada se zyada 10s purana (verified / claimed jaldi dikhe)
router.get('/', cachePublic(10, 20), listPeople)
router.get('/photos/:id', getPersonPhoto)
router.get('/:slug/reviews', cachePublic(10, 20), listPersonReviews)
router.get('/:slug', cachePublic(10, 20), getPersonBySlug)
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
    action: personUpdateAction,
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
