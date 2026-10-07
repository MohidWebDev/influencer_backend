import { Schema, model, type Types } from 'mongoose'
import {
  LANGUAGE_CODES,
  PROFILE_STATUSES,
  SOCIAL_PLATFORMS,
  SOURCE_TYPES,
  type ProfileStatus,
  type SocialPlatform,
  type SourceType,
} from '../constants/people'

// Person = public profile. Login account (User) alag hai.
// Person pehle se mojood ho sakta hai, user baad mein "claim" karta hai
export interface ISocialAccount {
  platform: SocialPlatform
  handle?: string
  url: string
  followers?: number
  engagementRate?: number
}

export interface ISourceRecord {
  sourceType: SourceType
  url?: string
  note?: string
  retrievedAt: Date
}

export interface IPerson {
  name: string
  slug: string
  headline?: string
  bio?: string
  photoUrl?: string
  status: ProfileStatus
  professions: Types.ObjectId[]
  industries: Types.ObjectId[]
  topics: Types.ObjectId[]
  languages: string[]
  country?: string
  city?: string
  websiteUrl?: string
  socialAccounts: ISocialAccount[]
  // Saare social accounts ke followers ka jor (search filter ke liye)
  totalFollowers: number
  claimedBy: Types.ObjectId | null
  representedBy: Types.ObjectId[]
  verified: boolean
  visibility: 'visible' | 'hidden'
  sourceRecords: ISourceRecord[]
  // Sample data jo baad mein ek command se hataya ja sake
  isDemo: boolean
  // Talent ki khud bheji hui profile: claim approve hone tak chhupi (visibility hidden)
  isDraft: boolean
  createdAt: Date
  updatedAt: Date
}

const socialAccountSchema = new Schema<ISocialAccount>(
  {
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
    handle: { type: String, trim: true },
    url: { type: String, required: true, trim: true },
    followers: { type: Number, min: 0 },
    engagementRate: { type: Number, min: 0, max: 100 },
  },
  { _id: false },
)

const sourceRecordSchema = new Schema<ISourceRecord>(
  {
    sourceType: { type: String, enum: SOURCE_TYPES, required: true },
    url: { type: String, trim: true },
    note: { type: String, trim: true },
    retrievedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const personSchema = new Schema<IPerson>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    headline: { type: String, trim: true, maxlength: 160 },
    bio: { type: String, trim: true, maxlength: 3000 },
    photoUrl: { type: String, trim: true },
    status: { type: String, enum: PROFILE_STATUSES, default: 'public' },
    professions: [{ type: Schema.Types.ObjectId, ref: 'Profession' }],
    industries: [{ type: Schema.Types.ObjectId, ref: 'Industry' }],
    topics: [{ type: Schema.Types.ObjectId, ref: 'Topic' }],
    languages: [{ type: String, enum: LANGUAGE_CODES }],
    country: { type: String, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
    city: { type: String, trim: true },
    websiteUrl: { type: String, trim: true },
    socialAccounts: { type: [socialAccountSchema], default: [] },
    totalFollowers: { type: Number, default: 0 },
    claimedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    representedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    verified: { type: Boolean, default: false },
    visibility: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
    sourceRecords: { type: [sourceRecordSchema], default: [] },
    isDemo: { type: Boolean, default: false },
    isDraft: { type: Boolean, default: false },
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

// Search filters ke liye indexes
personSchema.index({ visibility: 1, totalFollowers: -1 })
personSchema.index({ professions: 1 })
personSchema.index({ industries: 1 })
personSchema.index({ topics: 1 })
personSchema.index({ country: 1, city: 1 })

// Save se pehle followers ka jor dobara nikalo
personSchema.pre('save', function () {
  this.totalFollowers = this.socialAccounts.reduce(
    (sum, account) => sum + (account.followers ?? 0),
    0,
  )
})

export const Person = model<IPerson>('Person', personSchema)
