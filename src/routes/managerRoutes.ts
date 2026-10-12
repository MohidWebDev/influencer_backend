import { Router } from 'express'
import { getMyManagerProfile, saveMyManagerProfile } from '../controllers/managerController'
import {
  getMyTalent,
  listMyRepresentations,
  listMyTalents,
  managerEnd,
  managerRespond,
  requestRepresentation,
} from '../controllers/representationController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Manager / agent (representative account): apni tasdeeq, talents ke saath rishte aur roster
const router = Router()

router.use(requireAuth, requireRole('representative'))
router.get('/profile', getMyManagerProfile)
router.put('/profile', saveMyManagerProfile)
router.get('/representations', listMyRepresentations)
router.post('/representations', requestRepresentation)
router.post('/representations/:id/respond', managerRespond)
router.post('/representations/:id/end', managerEnd)
router.get('/talents', listMyTalents)
router.get('/talents/:personId', getMyTalent)

export default router
