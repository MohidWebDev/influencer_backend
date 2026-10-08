import { Router } from 'express'
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from '../controllers/notificationController'
import { requireAuth } from '../middlewares/requireAuth'

// Har logged-in user ki apni notifications
const router = Router()

router.use(requireAuth)
router.get('/', listNotifications)
router.get('/unread-count', unreadCount)
router.post('/read-all', markAllRead)
router.patch('/:id/read', markRead)

export default router
