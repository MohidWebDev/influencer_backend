import { randomBytes } from 'node:crypto'
import { Schema, model } from 'mongoose'

export const NEWSLETTER_STATUSES = ['subscribed', 'unsubscribed'] as const
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number]

// Footer ke newsletter form se aaye emails. Login zaroori nahi
export interface INewsletterSubscriber {
  email: string
  status: NewsletterStatus
  // Email ke "unsubscribe" link ke liye (andaza na lagaya ja sake)
  unsubscribeToken: string
  // Kis zaban mein subscribe kiya (en / ur / ar)
  language?: string
  subscribedAt: Date
  unsubscribedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const newsletterSubscriberSchema = new Schema<INewsletterSubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: NEWSLETTER_STATUSES, default: 'subscribed' },
    unsubscribeToken: {
      type: String,
      required: true,
      unique: true,
      select: false,
      default: () => randomBytes(24).toString('hex'),
    },
    language: { type: String, trim: true, maxlength: 5 },
    subscribedAt: { type: Date, default: Date.now },
    unsubscribedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'newsletter_subscribers',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        delete ret.unsubscribeToken
        return ret
      },
    },
  },
)

newsletterSubscriberSchema.index({ status: 1, subscribedAt: -1 })

export const NewsletterSubscriber = model<INewsletterSubscriber>(
  'NewsletterSubscriber',
  newsletterSubscriberSchema,
)
