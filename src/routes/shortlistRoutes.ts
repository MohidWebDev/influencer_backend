import { Router } from 'express'
import {
  addShortlistItem,
  createShortlist,
  deleteShortlist,
  getShortlist,
  listShortlists,
  removeShortlistItem,
  savedMembership,
  updateShortlist,
  updateShortlistItem,
} from '../controllers/shortlistController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Business / agency / organization ki campaign wali lists
const router = Router()

router.use(requireAuth, requireRole('business', 'agency', 'organization'))
router.get('/', listShortlists)
router.post('/', createShortlist)
router.get('/saved', savedMembership)
router.get('/:id', getShortlist)
router.patch('/:id', updateShortlist)
router.delete('/:id', deleteShortlist)
router.post('/:id/items', addShortlistItem)
router.patch('/:id/items/:personId', updateShortlistItem)
router.delete('/:id/items/:personId', removeShortlistItem)

export default router
