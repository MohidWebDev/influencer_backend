import { z } from 'zod'
import { SIGNUP_ROLES } from '../constants/roles'

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100),
  role: z.enum(SIGNUP_ROLES, 'Choose a valid account type'),
})

export const loginSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'The new password must be different from the current one',
  })

// User ko "delete <apna naam>" likhna hota hai
export const deleteAccountSchema = z.object({
  confirm: z.string().trim().min(1, 'Type the confirmation text'),
  // Talent: account ke saath public profile bhi hatane ki request
  removeProfile: z.boolean().default(false),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>

// Password bhool gaya: 1) email  2) email + OTP  3) email + reset token + naya password
export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
})

export const verifyResetCodeSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const resetPasswordSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  resetToken: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
})
