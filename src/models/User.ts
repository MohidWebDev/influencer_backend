import { Schema, model, type HydratedDocument, type Model } from 'mongoose'
import bcrypt from 'bcryptjs'
import { ROLES, type Role } from '../constants/roles'

// User = login account. Public profile (Person) alag model hoga
export interface IUser {
  name: string
  email: string
  password: string
  role: Role
  isEmailVerified: boolean
  status: 'active' | 'suspended'
  // Logout pe barhta hai, taake purane refresh tokens bekaar ho jayen
  tokenVersion: number
  createdAt: Date
  updatedAt: Date
}

interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>
}

type UserModel = Model<IUser, Record<string, never>, IUserMethods>

export type UserDocument = HydratedDocument<IUser, IUserMethods>

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select: false -> query mein password khud nahi aata
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    isEmailVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    tokenVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password
        delete ret.tokenVersion
        delete ret.__v
        return ret
      },
    },
  },
)

// Save se pehle password ko hash karo (sirf jab badla ho)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 10)
})

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password)
}

export const User = model<IUser, UserModel>('User', userSchema)
