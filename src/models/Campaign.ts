import { Schema, model, type Types } from 'mongoose'
import { HIRE_CURRENCIES } from '../constants/business'
import { CAMPAIGN_STATUSES, MAX_CAMPAIGN_SLOTS, type CampaignStatus } from '../constants/campaigns'
import { SERVICE_CATEGORIES, type ServiceCategory } from '../constants/services'

// Business / organization ka "open call": talent khud apply karte hain
export interface ICampaign {
  owner: Types.ObjectId
  title: string
  brief: string
  category: ServiceCategory
  budget?: { amount: number; currency: (typeof HIRE_CURRENCIES)[number] }
  // Khali = kisi bhi mulk ka talent
  country?: string
  // Is din ke baad applications band (khali = jab tak business band na kare)
  deadline?: Date
  // Kitne talent chahiye. Itne select ho jayen to campaign khud band
  slots: number
  status: CampaignStatus
  publishedAt?: Date
  closedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const campaignSchema = new Schema<ICampaign>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    brief: { type: String, required: true, trim: true, maxlength: 3000 },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
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
    country: { type: String, uppercase: true, trim: true, maxlength: 2 },
    deadline: { type: Date },
    slots: { type: Number, min: 1, max: MAX_CAMPAIGN_SLOTS, default: 1 },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft' },
    publishedAt: { type: Date },
    closedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

campaignSchema.index({ status: 1, publishedAt: -1 })
campaignSchema.index({ owner: 1, createdAt: -1 })

export const Campaign = model<ICampaign>('Campaign', campaignSchema)
