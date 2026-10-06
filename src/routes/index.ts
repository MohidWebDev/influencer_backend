import { Router } from 'express'
import authRoutes from './authRoutes'

// Saari API routes yahan ek jagah jorte hain
const router = Router()

router.use('/auth', authRoutes)

export default router
