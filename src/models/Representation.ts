import { Schema, model, type Types } from 'mongoose'
import { REPRESENTATION_STATUSES, type RepresentationStatus } from '../constants/manager'

export interface IRepresentationPermissions {
  manageProfile: boolean
  handleHires: boolean
}

// Talent aur us ke manager ka rishta. Hamesha talent ki marzi se:
// ya talent bulata hai (invited), ya manager poochta hai aur talent haan karta hai (requested).
// Ek talent ka ek waqt mein ek hi active manager
export interface IRepresentation {
  manager: Types.ObjectId
  talent: Types.ObjectId
  person: Types.ObjectId
  status: RepresentationStatus
  initiatedBy: 'talent' | 'manager'
  message?: string
  permissions: IRepresentationPermissions
  respondedAt?: Date
  endedAt?: Date
  endedBy?: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const representationSchema = new Schema<IRepresentation>(
  {
    manager: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    talent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    status: { type: String, enum: REPRESENTATION_STATUSES, required: true },
    initiatedBy: { type: String, enum: ['talent', 'manager'], required: true },
    message: { type: String, trim: true, maxlength: 1000 },
    permissions: {
      manageProfile: { type: Boolean, default: false },
      handleHires: { type: Boolean, default: false },
    },
    respondedAt: { type: Date },
    endedAt: { type: Date },
    // null = system ne khatam kiya (jaise manager ki tasdeeq wapas)
    endedBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
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

representationSchema.index({ manager: 1, status: 1 })
representationSchema.index({ talent: 1, status: 1 })
representationSchema.index({ person: 1, status: 1 })

export const Representation = model<IRepresentation>('Representation', representationSchema)
