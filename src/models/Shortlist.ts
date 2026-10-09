import { Schema, model, type Types } from 'mongoose'

export const MAX_SHORTLISTS = 50
export const MAX_SHORTLIST_ITEMS = 200

// Business (ya agency / organization) ki campaign ke hisaab se banayi hui list:
// "Ramadan campaign", "Tech podcast guests". Har shakhs ke saath apna private note
export interface IShortlistItem {
  person: Types.ObjectId
  note?: string
  addedAt: Date
}

export interface IShortlist {
  owner: Types.ObjectId
  name: string
  description?: string
  items: IShortlistItem[]
  createdAt: Date
  updatedAt: Date
}

const shortlistSchema = new Schema<IShortlist>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    items: {
      type: [
        new Schema<IShortlistItem>(
          {
            person: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
            note: { type: String, trim: true, maxlength: 1000 },
            addedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'shortlists',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

shortlistSchema.index({ owner: 1, updatedAt: -1 })
// Ek user ke do lists ka ek hi naam nahi (bade/chhote huroof se farq nahi)
shortlistSchema.index(
  { owner: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
)

export const Shortlist = model<IShortlist>('Shortlist', shortlistSchema)
