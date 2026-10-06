import { Router } from 'express'
import authRoutes from './authRoutes'
import peopleRoutes from './peopleRoutes'
import taxonomyRoutes from './taxonomyRoutes'

// Saari API routes yahan ek jagah jorte hain
const router = Router()

router.use('/auth', authRoutes)
router.use('/people', peopleRoutes)
router.use('/taxonomy', taxonomyRoutes)

export default router
