import { Schema, model, type Types } from 'mongoose'

// Upload ki hui tasveer jab file system nahi milta (Vercel): MongoDB mein.
// _id hi file ka naam hai (/api/uploads/<id>.<ext>)
export interface IUploadedImage {
  _id: Types.ObjectId
  owner?: Types.ObjectId
  data: Buffer
  contentType: string
  bytes: number
}

const uploadedImageSchema = new Schema<IUploadedImage>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    bytes: { type: Number, required: true },
  },
  { timestamps: true, collection: 'uploaded_images' },
)

export const UploadedImage = model<IUploadedImage>('UploadedImage', uploadedImageSchema)
