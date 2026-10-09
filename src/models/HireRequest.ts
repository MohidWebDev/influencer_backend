import { Schema, model, type Types } from 'mongoose'
import { HIRE_CURRENCIES, HIRE_STATUSES, type HireStatus } from '../constants/business'

// Verified business -> verified talent: "hum aap ko is kaam ke liye hire karna chahte hain"
export interface IHireRequest {
  business: Types.ObjectId
  businessProfile: Types.ObjectId
  person: Types.ObjectId
  // Request ke waqt profile ka maalik (talent). Isi ko jawab dena hai
  talent: Types.ObjectId
  // Talent ki kis service ke liye (optional). Title ki copy taake service mite to bhi dikhe
  serviceId?: Types.ObjectId
  serviceTitle?: string
  title: string
  message: string
  budget?: { amount: number; currency: (typeof HIRE_CURRENCIES)[number] }
  startDate?: Date
  status: HireStatus
  respondedAt?: Date
  responseNote?: string
  createdAt: Date
  updatedAt: Date
}

const hireRequestSchema = new Schema<IHireRequest>(
  {
    business: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessProfile: { type: Schema.Types.ObjectId, ref: 'BusinessProfile', required: true },
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    talent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    serviceId: { type: Schema.Types.ObjectId },
    serviceTitle: { type: String, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    budget: {
      type: new Schema(
        {
          amount: { type: Number, min: 1, required: true },
          currency: { type: String, enum: HIRE_CURRENCIES, default: 'PKR' },
        },
        { _id: false },
      ),
      default: undefined,
    },
    startDate: { type: Date },
    status: { type: String, enum: HIRE_STATUSES, default: 'pending' },
    respondedAt: { type: Date },
    responseNote: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    collection: 'hire_requests',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

hireRequestSchema.index({ business: 1, createdAt: -1 })
hireRequestSchema.index({ talent: 1, createdAt: -1 })
hireRequestSchema.index({ business: 1, person: 1, status: 1 })

export const HireRequest = model<IHireRequest>('HireRequest', hireRequestSchema)
