import { Router } from 'express'
import { subscribe, unsubscribe } from '../controllers/newsletterController'
import { newsletterLimiter } from '../middlewares/rateLimit'

// Footer ka newsletter: koi bhi subscribe kar sakta hai (login ke baghair)
const router = Router()

router.post('/subscribe', newsletterLimiter, subscribe)
router.post('/unsubscribe', newsletterLimiter, unsubscribe)

export default router
