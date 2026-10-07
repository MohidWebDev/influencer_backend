import { Router } from 'express'
import { createReport } from '../controllers/reportController'
import { optionalAuth } from '../middlewares/optionalAuth'
import { validate } from '../middlewares/validate'
import { createReportSchema } from '../validators/reportValidator'

const router = Router()

// Koi bhi (login ho ya na ho) profile report kar sakta hai
router.post('/', optionalAuth, validate(createReportSchema), createReport)

export default router
