import { Router } from 'express'
import adminRoutes from './adminRoutes'
import authRoutes from './authRoutes'
import claimRoutes from './claimRoutes'
import reportRoutes from './reportRoutes'
import peopleRoutes from './peopleRoutes'
import taxonomyRoutes from './taxonomyRoutes'

// Saari API routes yahan ek jagah jorte hain
const router = Router()

router.use('/auth', authRoutes)
router.use('/people', peopleRoutes)
router.use('/taxonomy', taxonomyRoutes)
router.use('/claims', claimRoutes)
router.use('/reports', reportRoutes)
router.use('/admin', adminRoutes)

export default router
