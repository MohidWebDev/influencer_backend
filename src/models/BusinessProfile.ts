import { Schema, model, type Types } from 'mongoose'
import { BUSINESS_STATUSES, COMPANY_SIZES, type BusinessStatus } from '../constants/business'
import { VERIFICATION_METHODS, type VerificationMethod } from './ProfileClaim'

export interface IBusinessVerification {
  // Kis raabte pe code bheja gaya (account email, website, proof link ya phone)
  channel?: string
  // Code kabhi seedha save nahi hota, sirf hash
  codeHash?: string
  codeSentAt?: Date
  expiresAt?: Date
}

// Business account ki company details. Admin code bhejta hai, business code daalta hai,
// phir admin approve kare to business "verified" aur sirf tab woh verified talents ko hire kar sakta hai
export interface IBusinessProfile {
  owner: Types.ObjectId
  companyName: string
  industry?: string
  companySize?: (typeof COMPANY_SIZES)[number]
  description?: string
  websiteUrl: string
  registrationNumber?: string
  country: string
  city?: string
  contactPhone?: string
  // Tasdeeq ke liye links (LinkedIn page, registration certificate, press waghera)
  proofLinks: string[]
  status: BusinessStatus
  verification: IBusinessVerification
  // OTP ki ghalat koshishein (5 pe lock)
  otpAttempts: number
  otpLockedAt?: Date
  lastOtpAttemptAt?: Date
  // Kab, kisne aur kaise tasdeeq hui. verifiedBy null = business ne OTP se khud kiya
  verifiedAt?: Date
  verifiedBy?: Types.ObjectId | null
  verificationMethod?: VerificationMethod
  submittedAt: Date
  reviewedBy?: Types.ObjectId
  reviewedAt?: Date
  rejectionReason?: string
  createdAt: Date
  updatedAt: Date
}

const businessProfileSchema = new Schema<IBusinessProfile>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    companyName: { type: String, required: true, trim: true, maxlength: 120 },
    industry: { type: String, trim: true, maxlength: 80 },
    companySize: { type: String, enum: COMPANY_SIZES },
    description: { type: String, trim: true, maxlength: 1000 },
    websiteUrl: { type: String, required: true, trim: true },
    registrationNumber: { type: String, trim: true, maxlength: 60 },
    country: { type: String, required: true, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
    city: { type: String, trim: true, maxlength: 80 },
    contactPhone: { type: String, trim: true, maxlength: 30 },
    proofLinks: { type: [String], default: [] },
    status: { type: String, enum: BUSINESS_STATUSES, default: 'pending' },
    verification: {
      channel: { type: String, trim: true },
      codeHash: { type: String, select: false },
      codeSentAt: { type: Date },
      expiresAt: { type: Date },
    },
    otpAttempts: { type: Number, default: 0 },
    otpLockedAt: { type: Date },
    lastOtpAttemptAt: { type: Date },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
    verificationMethod: { type: String, enum: VERIFICATION_METHODS },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    collection: 'business_profiles',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        const verification = ret.verification as { codeHash?: string } | undefined
        if (verification) delete verification.codeHash
        return ret
      },
    },
  },
)

businessProfileSchema.index({ status: 1, submittedAt: 1 })

export const BusinessProfile = model<IBusinessProfile>('BusinessProfile', businessProfileSchema)
