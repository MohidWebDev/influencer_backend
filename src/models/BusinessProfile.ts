import { Schema, model, type Types } from 'mongoose'
import { BUSINESS_STATUSES, COMPANY_SIZES, type BusinessStatus } from '../constants/business'

// Business account ki company details. Admin approve kare to business "verified"
// aur sirf tab woh verified talents ko hire kar sakta hai
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
        return ret
      },
    },
  },
)

businessProfileSchema.index({ status: 1, submittedAt: 1 })

export const BusinessProfile = model<IBusinessProfile>('BusinessProfile', businessProfileSchema)
