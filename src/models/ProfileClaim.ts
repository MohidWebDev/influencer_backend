import { Schema, model, type Types } from 'mongoose'

// pending            -> talent ne claim bheja, admin ko code bhejna hai
// waiting_for_talent -> admin ne talent ke official account pe code (OTP) DM kiya
// otp_failed         -> talent ne 5 dafa ghalat code daala, claim lock ho gaya (admin dekhega)
// verified           -> tasdeeq ho gayi: sahi OTP se, ya admin ne khud (admin_manual)
// approved           -> admin ki final manzoori, person.claimedBy set
// rejected           -> admin ne reject kiya
export const CLAIM_STATUSES = [
  'pending',
  'waiting_for_talent',
  'otp_failed',
  'verified',
  'approved',
  'rejected',
] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

// Purane documents ke naam. Sirf enum mein hain taake purana data validation fail na kare;
// connect hote hi migrateLegacyClaims() inhe naye naamon mein badal deta hai
export const LEGACY_CLAIM_STATUSES = ['code_sent', 'code_verified'] as const

// Jab tak claim in mein se kisi halat mein hai, woh "khula" hai
export const OPEN_CLAIM_STATUSES: ClaimStatus[] = [
  'pending',
  'waiting_for_talent',
  'otp_failed',
  'verified',
]
// Jin pe admin ko kuch karna hai: code bhejna, lock dekhna, ya approve karna
export const NEEDS_ACTION_CLAIM_STATUSES: ClaimStatus[] = ['pending', 'otp_failed', 'verified']

export const VERIFICATION_METHODS = ['otp', 'admin_manual'] as const
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]

export const CODE_TTL_MS = 48 * 60 * 60 * 1000 // 48 ghante
export const MAX_CODE_ATTEMPTS = 5

export interface IClaimVerification {
  // Kis link (Instagram waghera) pe code bheja gaya
  channelUrl?: string
  // Code kabhi seedha save nahi hota, sirf hash
  codeHash?: string
  codeSentAt?: Date
  expiresAt?: Date
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
  // true = talent ne apni nayi profile khud banayi (profile approve hone tak chhupi)
  isNewProfile: boolean
  // Nayi profile ka naam: reject pe draft delete ho jaye tab bhi talent ko naam dikhe
  requestedName?: string
  // OTP ki ghalat koshishein (5 pe lock)
  otpAttempts: number
  otpLockedAt?: Date
  lastOtpAttemptAt?: Date
  // Kab, kisne aur kaise tasdeeq hui. verifiedBy null = talent ne OTP se khud kiya
  verifiedAt?: Date
  verifiedBy?: Types.ObjectId | null
  verificationMethod?: VerificationMethod
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
    status: {
      type: String,
      enum: [...CLAIM_STATUSES, ...LEGACY_CLAIM_STATUSES],
      default: 'pending',
    },
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
    },
    isNewProfile: { type: Boolean, default: false },
    requestedName: { type: String, trim: true },
    otpAttempts: { type: Number, default: 0, min: 0 },
    otpLockedAt: { type: Date },
    lastOtpAttemptAt: { type: Date },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verificationMethod: { type: String, enum: VERIFICATION_METHODS },
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

// Purane claims ko naye status/fields mein badalta hai. Har bar chalana safe hai (idempotent)
export async function migrateLegacyClaims() {
  const collection = ProfileClaim.collection
  await collection.updateMany({ status: 'code_sent' }, { $set: { status: 'waiting_for_talent' } })
  await collection.updateMany({ status: 'code_verified' }, [
    {
      $set: {
        status: 'verified',
        verificationMethod: 'otp',
        verifiedBy: null,
        verifiedAt: { $ifNull: ['$verification.verifiedAt', '$updatedAt'] },
      },
    },
  ])
  // Jin khule claims ki profile delete ho chuki hai unhe reject karo (delete nahi), taake
  // admin list crash na ho aur talent naya claim bhej sake
  const orphans = await collection
    .aggregate<{ _id: Types.ObjectId }>([
      { $match: { status: { $in: [...OPEN_CLAIM_STATUSES, ...LEGACY_CLAIM_STATUSES] } } },
      { $lookup: { from: 'people', localField: 'person', foreignField: '_id', as: 'p' } },
      { $match: { p: { $size: 0 } } },
      { $project: { _id: 1 } },
    ])
    .toArray()
  if (orphans.length > 0) {
    await collection.updateMany(
      { _id: { $in: orphans.map((o) => o._id) } },
      {
        $set: {
          status: 'rejected',
          reviewedAt: new Date(),
          rejectionReason: 'This profile was removed',
        },
        $unset: { 'verification.codeHash': 1 },
      },
    )
  }
  // verification.attempts -> otpAttempts (na ho to 0)
  await collection.updateMany({ otpAttempts: { $exists: false } }, [
    { $set: { otpAttempts: { $ifNull: ['$verification.attempts', 0] } } },
    { $unset: ['verification.attempts', 'verification.verifiedAt'] },
  ])
}
