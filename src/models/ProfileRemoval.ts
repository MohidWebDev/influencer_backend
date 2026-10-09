import { Schema, model, type Types } from 'mongoose'

// Kisi ne profile hatane ko kaha (jaise maalik ne account mitate waqt). Seed isi list se
// pehchanta hai ke ye profile dobara nahi banani:
// pending -> profile chhupi, admin faisla karega
// removed -> admin ne hamesha ke liye mita di (seed:real dobara nahi banayega)
// kept    -> admin ne rakhne ka faisla kiya (profile chhupi rehti hai, admin khud dikha sakta hai)
export const REMOVAL_STATUSES = ['pending', 'removed', 'kept'] as const
export type RemovalStatus = (typeof REMOVAL_STATUSES)[number]

export interface IProfileRemoval {
  person?: Types.ObjectId
  // Profile mit jaye tab bhi pehchaan rahe
  slug: string
  name: string
  requestedByName?: string
  requestedByEmail?: string
  fromOwner: boolean
  report?: Types.ObjectId
  status: RemovalStatus
  decidedAt?: Date
  decidedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const profileRemovalSchema = new Schema<IProfileRemoval>(
  {
    person: { type: Schema.Types.ObjectId, ref: 'Person' },
    slug: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    requestedByName: { type: String, trim: true },
    requestedByEmail: { type: String, trim: true, lowercase: true },
    fromOwner: { type: Boolean, default: false },
    report: { type: Schema.Types.ObjectId, ref: 'Report' },
    status: { type: String, enum: REMOVAL_STATUSES, default: 'pending' },
    decidedAt: { type: Date },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'profile_removals' },
)

profileRemovalSchema.index({ slug: 1, status: 1 })
profileRemovalSchema.index({ report: 1 })

export const ProfileRemoval = model<IProfileRemoval>('ProfileRemoval', profileRemovalSchema)
