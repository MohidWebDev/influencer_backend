import { Schema, model, type Types } from 'mongoose'

// "Password bhool gaya" ki ek request: email pe bheja gaya OTP (sirf hash) aur
// OTP sahi hone ke baad milne wala reset token (sirf hash). Har user ki ek hi request
export interface IPasswordReset {
  user: Types.ObjectId
  codeHash?: string
  attempts: number
  lastSentAt: Date
  resetTokenHash?: string
  // Is waqt ke baad MongoDB khud document mita deta hai (TTL index)
  expiresAt: Date
}

const passwordResetSchema = new Schema<IPasswordReset>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    resetTokenHash: { type: String },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
)

export const PasswordReset = model<IPasswordReset>('PasswordReset', passwordResetSchema)
