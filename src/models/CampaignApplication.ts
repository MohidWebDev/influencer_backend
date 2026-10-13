import { Schema, model, type Types } from 'mongoose'
import { APPLICATION_STATUSES, type ApplicationStatus } from '../constants/campaigns'

// Talent ki kisi campaign pe application (apni claimed profile ke saath)
export interface ICampaignApplication {
  campaign: Types.ObjectId
  // Campaign ka maalik (business), taake account mitne pe saaf ho sake
  business: Types.ObjectId
  applicant: Types.ObjectId
  person: Types.ObjectId
  pitch: string
  status: ApplicationStatus
  respondedAt?: Date
  // Select hone pe bani hire request (muahida wahin se)
  hire?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const applicationSchema = new Schema<ICampaignApplication>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    business: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    pitch: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'pending' },
    respondedAt: { type: Date },
    hire: { type: Schema.Types.ObjectId, ref: 'HireRequest' },
  },
  {
    timestamps: true,
    collection: 'campaign_applications',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

// Ek talent ek campaign pe ek hi dafa
applicationSchema.index({ campaign: 1, applicant: 1 }, { unique: true })
applicationSchema.index({ applicant: 1, createdAt: -1 })

export const CampaignApplication = model<ICampaignApplication>(
  'CampaignApplication',
  applicationSchema,
)
