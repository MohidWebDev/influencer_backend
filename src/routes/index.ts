import { Router } from 'express'
import adminRoutes from './adminRoutes'
import agreementRoutes from './agreementRoutes'
import authRoutes from './authRoutes'
import businessRoutes from './businessRoutes'
import claimRoutes from './claimRoutes'
import notificationRoutes from './notificationRoutes'
import reportRoutes from './reportRoutes'
import peopleRoutes from './peopleRoutes'
import taxonomyRoutes from './taxonomyRoutes'
import serviceRoutes from './serviceRoutes'
import shortlistRoutes from './shortlistRoutes'

// Saari API routes yahan ek jagah jorte hain
const router = Router()

router.use('/auth', authRoutes)
router.use('/people', peopleRoutes)
router.use('/taxonomy', taxonomyRoutes)
router.use('/claims', claimRoutes)
router.use('/reports', reportRoutes)
router.use('/admin', adminRoutes)
router.use('/notifications', notificationRoutes)
router.use('/me', serviceRoutes)
router.use('/business', businessRoutes)
router.use('/agreements', agreementRoutes)
router.use('/shortlists', shortlistRoutes)

export default router
