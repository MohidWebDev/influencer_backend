import type { Types } from 'mongoose'
import { Notification, type NotificationType } from '../models/Notification'
import { User } from '../models/User'

type Id = Types.ObjectId | string

interface NotificationInput {
  type: NotificationType
  data?: Record<string, string | undefined>
  link: string
}

// undefined values hata do (Mixed field mein saaf data)
function clean(data: NotificationInput['data'] = {}) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Record<
    string,
    string
  >
}

// Notification fail ho to asal kaam (claim, report) fail nahi hona chahiye
async function safely(work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    console.error('Notification failed', error)
  }
}

// Ek user ko
export function notifyUser(recipient: Id, input: NotificationInput) {
  return safely(() =>
    Notification.create({ recipient, type: input.type, data: clean(input.data), link: input.link }),
  )
}

// Har active admin ko ek ek copy (har admin apni read/unread khud rakhta hai)
export function notifyAdmins(input: NotificationInput) {
  return safely(async () => {
    const admins = await User.find({ role: 'admin', status: 'active' }).select('_id')
    if (admins.length === 0) return
    const data = clean(input.data)
    await Notification.insertMany(
      admins.map((admin) => ({ recipient: admin._id, type: input.type, data, link: input.link })),
    )
  })
}
