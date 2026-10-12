import { Schema, model, type Types } from 'mongoose'
import { MANAGER_STATUSES, type ManagerStatus } from '../constants/manager'

// Manager / agent ki professional details. Admin approve kare to "verified manager",
// aur sirf tab woh talents ke saath jur sakta hai (talent ki ijazat se)
export interface IManagerProfile {
  owner: Types.ObjectId
  // Akela kaam karta ho to khali
  agencyName?: string
  // Website ya LinkedIn
  websiteUrl: string
  country: string
  city?: string
  contactPhone?: string
  bio?: string
  // Takreeban kitne talents sambhalta hai
  talentsCount?: number
  // Tasdeeq ke liye links (management contract, press, agency page waghera)
  proofLinks: string[]
  status: ManagerStatus
  submittedAt: Date
  reviewedBy?: Types.ObjectId
  reviewedAt?: Date
  rejectionReason?: string
  createdAt: Date
  updatedAt: Date
}

const managerProfileSchema = new Schema<IManagerProfile>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    agencyName: { type: String, trim: true, maxlength: 120 },
    websiteUrl: { type: String, required: true, trim: true },
    country: { type: String, required: true, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
    city: { type: String, trim: true, maxlength: 80 },
    contactPhone: { type: String, trim: true, maxlength: 30 },
    bio: { type: String, trim: true, maxlength: 1000 },
    talentsCount: { type: Number, min: 0, max: 10000 },
    proofLinks: { type: [String], default: [] },
    status: { type: String, enum: MANAGER_STATUSES, default: 'pending' },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    collection: 'manager_profiles',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

managerProfileSchema.index({ status: 1, submittedAt: 1 })

export const ManagerProfile = model<IManagerProfile>('ManagerProfile', managerProfileSchema)
