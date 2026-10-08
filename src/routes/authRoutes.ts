import { Router } from 'express'
import {
  changePassword,
  deleteAccount,
  login,
  logout,
  me,
  refresh,
  register,
} from '../controllers/authController'
import {
  forgotPassword,
  resetPassword,
  verifyResetCode,
} from '../controllers/passwordResetController'
import { validate } from '../middlewares/validate'
import { requireAuth } from '../middlewares/requireAuth'
import { loginSchema, registerSchema } from '../validators/authValidator'

const router = Router()

router.post('/register', validate(registerSchema), register)
router.post('/login', validate(loginSchema), login)
router.post('/refresh', refresh)
router.post('/logout', logout)
router.post('/forgot-password', forgotPassword)
router.post('/forgot-password/verify', verifyResetCode)
router.post('/reset-password', resetPassword)
router.get('/me', requireAuth, me)
router.patch('/password', requireAuth, changePassword)
router.delete('/account', requireAuth, deleteAccount)

export default router
