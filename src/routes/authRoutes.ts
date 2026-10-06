import { Router } from 'express'
import { login, logout, me, refresh, register } from '../controllers/authController'
import { validate } from '../middlewares/validate'
import { requireAuth } from '../middlewares/requireAuth'
import { loginSchema, registerSchema } from '../validators/authValidator'

const router = Router()

router.post('/register', validate(registerSchema), register)
router.post('/login', validate(loginSchema), login)
router.post('/refresh', refresh)
router.post('/logout', logout)
router.get('/me', requireAuth, me)

export default router
