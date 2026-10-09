import { Schema, model, type Types } from 'mongoose'
import {
  AGREEMENT_PARTIES,
  AGREEMENT_STATUSES,
  DISPUTE_OUTCOMES,
  MILESTONE_STATUSES,
  type AgreementParty,
  type AgreementStatus,
  type DisputeOutcome,
  type MilestoneStatus,
} from '../constants/agreements'
import { CURRENCIES } from '../constants/services'

export interface IAgreementMilestone {
  title: string
  amount: number
  dueDate?: Date
}

// Muahide ki shartein. Sign hone ke baad yahi lock hoti hain
export interface IAgreementTerms {
  title: string
  scope: string
  currency: (typeof CURRENCIES)[number]
  milestones: IAgreementMilestone[]
  paymentTerms?: string
  usageRights?: string
  revisions: number
  cancellationTerms?: string
}

// Har version ka record (kis ne kab kya propose kiya): dispute mein saboot
export interface IAgreementVersion {
  version: number
  terms: IAgreementTerms
  proposedBy: AgreementParty
  proposedAt: Date
}

export interface ISignature {
  version: number
  signedAt: Date
  name: string
  email: string
  ip?: string
  userAgent?: string
}

export interface ISignCode {
  codeHash?: string
  version?: number
  attempts: number
  lastSentAt?: Date
  expiresAt?: Date
}

// Active hone ke baad har milestone ka kaam (terms.milestones ke hi index pe)
export interface IMilestoneWork {
  status: MilestoneStatus
  deliveredAt?: Date
  deliveryNote?: string
  deliveryLink?: string
  approvedAt?: Date
  changesNote?: string
}

export interface IReview {
  rating: number
  comment?: string
  createdAt: Date
}

export interface IAgreement {
  hire: Types.ObjectId
  business: Types.ObjectId
  businessProfile: Types.ObjectId
  talent: Types.ObjectId
  person: Types.ObjectId
  status: AgreementStatus
  terms: IAgreementTerms
  version: number
  proposedBy: AgreementParty
  proposedAt: Date
  history: IAgreementVersion[]
  signatures: { business?: ISignature; talent?: ISignature }
  signCodes: { business?: ISignCode; talent?: ISignCode }
  // Dono ke sign ke baad: shartein + dono taraf + version ka SHA-256 (baad mein badla to pata chale)
  signedHash?: string
  activatedAt?: Date
  work: IMilestoneWork[]
  revisionsUsed: number
  dispute?: {
    openedBy: AgreementParty
    reason: string
    openedAt: Date
    outcome?: DisputeOutcome
    note?: string
    resolvedAt?: Date
    resolvedBy?: Types.ObjectId
  }
  // reviews.business = business ki likhi (talent ke baare mein), reviews.talent = talent ki
  reviews: { business?: IReview; talent?: IReview }
  completedAt?: Date
  cancelledAt?: Date
  cancelledBy?: AgreementParty | 'admin'
  cancelReason?: string
  createdAt: Date
  updatedAt: Date
}

const milestoneSchema = new Schema<IAgreementMilestone>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date },
  },
  { _id: false },
)

const termsSchema = new Schema<IAgreementTerms>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    scope: { type: String, required: true, trim: true, maxlength: 3000 },
    currency: { type: String, enum: CURRENCIES, default: 'PKR' },
    milestones: { type: [milestoneSchema], default: [] },
    paymentTerms: { type: String, trim: true, maxlength: 1000 },
    usageRights: { type: String, trim: true, maxlength: 1000 },
    revisions: { type: Number, min: 0, default: 2 },
    cancellationTerms: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
)

const signatureSchema = new Schema<ISignature>(
  {
    version: { type: Number, required: true },
    signedAt: { type: Date, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    ip: { type: String },
    userAgent: { type: String },
  },
  { _id: false },
)

const signCodeSchema = new Schema<ISignCode>(
  {
    codeHash: { type: String },
    version: { type: Number },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date },
    expiresAt: { type: Date },
  },
  { _id: false },
)

const reviewSchema = new Schema<IReview>(
  {
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const agreementSchema = new Schema<IAgreement>(
  {
    hire: { type: Schema.Types.ObjectId, ref: 'HireRequest', required: true, unique: true },
    business: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessProfile: { type: Schema.Types.ObjectId, ref: 'BusinessProfile', required: true },
    talent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    status: { type: String, enum: AGREEMENT_STATUSES, default: 'negotiating' },
    terms: { type: termsSchema, required: true },
    version: { type: Number, default: 1 },
    proposedBy: { type: String, enum: AGREEMENT_PARTIES, required: true },
    proposedAt: { type: Date, default: Date.now },
    history: {
      type: [
        new Schema<IAgreementVersion>(
          {
            version: { type: Number, required: true },
            terms: { type: termsSchema, required: true },
            proposedBy: { type: String, enum: AGREEMENT_PARTIES, required: true },
            proposedAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    signatures: {
      business: { type: signatureSchema, default: undefined },
      talent: { type: signatureSchema, default: undefined },
    },
    // Code ka hash kabhi jawab mein nahi jata
    signCodes: {
      type: new Schema(
        {
          business: { type: signCodeSchema, default: undefined },
          talent: { type: signCodeSchema, default: undefined },
        },
        { _id: false },
      ),
      default: () => ({}),
      select: false,
    },
    signedHash: { type: String },
    activatedAt: { type: Date },
    work: {
      type: [
        new Schema<IMilestoneWork>(
          {
            status: { type: String, enum: MILESTONE_STATUSES, default: 'pending' },
            deliveredAt: { type: Date },
            deliveryNote: { type: String, trim: true, maxlength: 1000 },
            deliveryLink: { type: String, trim: true },
            approvedAt: { type: Date },
            changesNote: { type: String, trim: true, maxlength: 1000 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    revisionsUsed: { type: Number, default: 0 },
    dispute: {
      type: new Schema(
        {
          openedBy: { type: String, enum: AGREEMENT_PARTIES, required: true },
          reason: { type: String, required: true, trim: true, maxlength: 2000 },
          openedAt: { type: Date, required: true },
          outcome: { type: String, enum: DISPUTE_OUTCOMES },
          note: { type: String, trim: true, maxlength: 2000 },
          resolvedAt: { type: Date },
          resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        },
        { _id: false },
      ),
      default: undefined,
    },
    reviews: {
      business: { type: reviewSchema, default: undefined },
      talent: { type: reviewSchema, default: undefined },
    },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, enum: [...AGREEMENT_PARTIES, 'admin'] },
    cancelReason: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: true,
    collection: 'agreements',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        delete ret.signCodes
        return ret
      },
    },
  },
)

agreementSchema.index({ business: 1, updatedAt: -1 })
agreementSchema.index({ talent: 1, updatedAt: -1 })
agreementSchema.index({ status: 1, updatedAt: -1 })
agreementSchema.index({ person: 1, status: 1 })

export const Agreement = model<IAgreement>('Agreement', agreementSchema)
