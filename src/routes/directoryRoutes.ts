import { Router } from 'express'
import {
  getBusiness,
  getManager,
  listBusinesses,
  listBusinessReviews,
  listManagerReviews,
  listManagers,
} from '../controllers/directoryController'
import { cachePublic } from '../middlewares/cachePublic'

// Public: navbar ke "Businesses" aur "Managers" pages aur un ki tafseel
const router = Router()

router.get('/businesses', cachePublic(10, 20), listBusinesses)
router.get('/businesses/:id', cachePublic(10, 20), getBusiness)
router.get('/businesses/:id/reviews', cachePublic(10, 20), listBusinessReviews)
router.get('/managers', cachePublic(10, 20), listManagers)
router.get('/managers/:id', cachePublic(10, 20), getManager)
router.get('/managers/:id/reviews', cachePublic(10, 20), listManagerReviews)

export default router
