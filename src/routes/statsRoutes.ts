import { Router } from 'express'
import { getHomeStats } from '../controllers/statsController'
import { cachePublic } from '../middlewares/cachePublic'

// Public numbers (home page). CDN pe 5 minute cache: har visitor pe DB count nahi
const router = Router()

router.get('/home', cachePublic(300, 1800), getHomeStats)

export default router
