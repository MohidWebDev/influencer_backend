import { Schema, model, type Types } from 'mongoose'

// pending       -> talent ne claim bheja, admin ko code bhejna hai
// code_sent     -> admin ne talent ke official account pe code DM kiya
// code_verified -> talent ne sahi code website pe daala, admin final approve karega
// approved / rejected
export const CLAIM_STATUSES = ['pending', 'code_sent', 'code_verified', 'approved', 'rejected'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

// Jab tak claim in mein se kisi halat mein hai, woh "khula" hai
export const OPEN_CLAIM_STATUSES: ClaimStatus[] = ['pending', 'code_sent', 'code_verified']

export const CODE_TTL_MS = 48 * 60 * 60 * 1000 // 48 ghante
export const MAX_CODE_ATTEMPTS = 5

export interface IClaimVerification {
  // Kis link (Instagram waghera) pe code bheja gaya
  channelUrl?: string
  // Code kabhi seedha save nahi hota, sirf hash
  codeHash?: string
  codeSentAt?: Date
  expiresAt?: Date
  attempts: number
  verifiedAt?: Date
}

// Talent kehta hai "ye profile meri hai". Admin code bhej kar tasdeeq karta hai
export interface IProfileClaim {
  person: Types.ObjectId
  user: Types.ObjectId
  status: ClaimStatus
  evidence: {
    contactEmail?: string
    links: string[]
    note?: string
  }
  verification: IClaimVerification
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
      note: { type: String, trim: true, maxlength: 1000 },
    },
    verification: {
      channelUrl: { type: String, trim: true },
      codeHash: { type: String, select: false },
      codeSentAt: { type: Date },
      expiresAt: { type: Date },
      attempts: { type: Number, default: 0 },
      verifiedAt: { type: Date },
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
        const verification = ret.verification as Record<string, unknown> | undefined
        if (verification) delete verification.codeHash
        return ret
      },
    },
  },
)

profileClaimSchema.index({ status: 1, createdAt: -1 })
profileClaimSchema.index({ user: 1, createdAt: -1 })
profileClaimSchema.index({ person: 1, status: 1 })

export const ProfileClaim = model<IProfileClaim>('ProfileClaim', profileClaimSchema)
