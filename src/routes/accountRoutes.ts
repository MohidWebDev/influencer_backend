import { Router } from 'express'
import { removeAvatar, uploadAvatar } from '../controllers/uploadController'
import { requireAuth } from '../middlewares/requireAuth'
import { uploadImage } from '../middlewares/upload'

// Har logged-in account ki apni cheezein (abhi: photo / logo)
const router = Router()

router.use(requireAuth)
router.put('/avatar', uploadImage, uploadAvatar)
router.delete('/avatar', removeAvatar)

export default router
