import { Schema, model, type Types } from 'mongoose'

// "Report an error / request removal" (document: har Person pe ye action hona chahiye)
export const REPORT_REASONS = [
  'incorrect_info',
  'impersonation',
  'removal_request',
  'inappropriate',
  'copyright',
  'other',
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'rejected'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export interface IReport {
  person: Types.ObjectId
  reason: ReportReason
  details: string
  // Login user ho to user, warna naam/email
  reporter?: Types.ObjectId
  reporterName?: string
  reporterEmail?: string
  status: ReportStatus
  adminNote?: string
  handledBy?: Types.ObjectId
  handledAt?: Date
  createdAt: Date
  updatedAt: Date
}

const reportSchema = new Schema<IReport>(
  {
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, required: true, trim: true, maxlength: 2000 },
    reporter: { type: Schema.Types.ObjectId, ref: 'User' },
    reporterName: { type: String, trim: true, maxlength: 100 },
    reporterEmail: { type: String, trim: true, lowercase: true },
    status: { type: String, enum: REPORT_STATUSES, default: 'open' },
    adminNote: { type: String, trim: true, maxlength: 1000 },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handledAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'reports',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

reportSchema.index({ status: 1, createdAt: 1 })
reportSchema.index({ person: 1, createdAt: -1 })

export const Report = model<IReport>('Report', reportSchema)
