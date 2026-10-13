import { Router } from 'express'
import {
  applyToCampaign,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaignApplications,
  listCampaigns,
  listMyApplications,
  listMyCampaigns,
  respondApplication,
  updateCampaign,
  withdrawApplication,
} from '../controllers/campaignController'
import { cachePublic } from '../middlewares/cachePublic'
import { optionalAuth } from '../middlewares/optionalAuth'
import { requireAuth } from '../middlewares/requireAuth'
import { requireRole } from '../middlewares/requireRole'

// Business / organization ki campaigns ("open call"), jin pe talent khud apply karte hain
const router = Router()
const business = [requireAuth, requireRole('business')]
const talent = [requireAuth, requireRole('talent')]

// Public list (CDN pe thori der cache)
router.get('/', cachePublic(10, 20), listCampaigns)

// /:id se pehle, warna "mine" / "applications" id ban jate
router.get('/mine', ...business, listMyCampaigns)
router.get('/applications/mine', ...talent, listMyApplications)
router.post('/applications/:applicationId/withdraw', ...talent, withdrawApplication)

router.post('/', ...business, createCampaign)
router.get('/:id', optionalAuth, getCampaign)
router.patch('/:id', ...business, updateCampaign)
router.delete('/:id', ...business, deleteCampaign)
router.get('/:id/applications', ...business, listCampaignApplications)
router.patch('/:id/applications/:applicationId', ...business, respondApplication)
router.post('/:id/apply', ...talent, applyToCampaign)

export default router
