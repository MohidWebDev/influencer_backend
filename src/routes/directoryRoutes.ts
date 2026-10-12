import { Router } from 'express'
import { listBusinesses, listManagers } from '../controllers/directoryController'
import { cachePublic } from '../middlewares/cachePublic'

// Public: navbar ke "Businesses" aur "Managers" pages
const router = Router()

router.get('/businesses', cachePublic(10, 20), listBusinesses)
router.get('/managers', cachePublic(10, 20), listManagers)

export default router
