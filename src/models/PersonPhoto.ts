import { Schema, model, type Types } from 'mongoose'

// Profile photo ki asal file (MongoDB mein). Bahar ki site se hotlink nahi hoti;
// GET /api/people/photos/:id se serve hoti hai aur Vercel CDN pe cache hoti hai
export interface IPersonPhoto {
  person: Types.ObjectId
  data: Buffer
  contentType: string
  width?: number
  bytes: number
}

const personPhotoSchema = new Schema<IPersonPhoto>(
  {
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    width: { type: Number },
    bytes: { type: Number, required: true },
  },
  { timestamps: true },
)

export const PersonPhoto = model<IPersonPhoto>('PersonPhoto', personPhotoSchema)
