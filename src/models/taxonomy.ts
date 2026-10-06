import { Schema, model } from 'mongoose'

// Profession, Industry aur Topic teeno ki shakal ek jaisi hai
export interface ITaxonomyItem {
  name: string
  slug: string
  order: number
}

function createTaxonomySchema() {
  return new Schema<ITaxonomyItem>(
    {
      name: { type: String, required: true, trim: true },
      slug: { type: String, required: true, unique: true, lowercase: true },
      order: { type: Number, default: 0 },
    },
    {
      timestamps: true,
      toJSON: {
        transform: (_doc, ret: Record<string, unknown>) => {
          delete ret.__v
          delete ret.createdAt
          delete ret.updatedAt
          return ret
        },
      },
    },
  )
}

export const Profession = model<ITaxonomyItem>('Profession', createTaxonomySchema())
export const Industry = model<ITaxonomyItem>('Industry', createTaxonomySchema())
export const Topic = model<ITaxonomyItem>('Topic', createTaxonomySchema())
