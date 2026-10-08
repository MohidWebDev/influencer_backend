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
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
