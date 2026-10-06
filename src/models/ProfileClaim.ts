import { Schema, model, type Types } from 'mongoose'

export const CLAIM_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

// Talent kehta hai "ye profile meri hai". Admin saboot dekh kar approve/reject karta hai
export interface IProfileClaim {
  person: Types.ObjectId
  user: Types.ObjectId
  status: ClaimStatus
  evidence: {
    contactEmail?: string
    links: string[]
    note: string
  }
  reviewedBy?: Types.ObjectId
  reviewedAt?: Date
  rejectionReason?: string
  createdAt: Date
  updatedAt: Date
}

const profileClaimSchema = new Schema<IProfileClaim>(
  {
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: CLAIM_STATUSES, default: 'pending' },
    evidence: {
      contactEmail: { type: String, trim: true, lowercase: true },
      links: [{ type: String, trim: true }],
      note: { type: String, required: true, trim: true, maxlength: 1000 },
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
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

profileClaimSchema.index({ status: 1, createdAt: -1 })
profileClaimSchema.index({ user: 1, createdAt: -1 })
profileClaimSchema.index({ person: 1, status: 1 })

export const ProfileClaim = model<IProfileClaim>('ProfileClaim', profileClaimSchema)
