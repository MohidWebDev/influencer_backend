import { z } from 'zod'
import { COMPANY_SIZES } from '../constants/business'
import { SIGNUP_ROLES } from '../constants/roles'

// Signup ka form account type ke hisaab se: business apni company ki details deta hai
// (naam ki jagah company ka naam), baqi sab apna poora naam
export const registerSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    email: z.email('Enter a valid email').trim().toLowerCase(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100),
    role: z.enum(SIGNUP_ROLES, 'Choose a valid account type'),
    companyName: z.string().trim().max(120, 'Use at most 120 characters').optional(),
    industry: z.string().trim().max(80, 'Use at most 80 characters').optional(),
    companySize: z.enum([...COMPANY_SIZES, ''], 'Choose a company size').optional(),
    description: z.string().trim().max(1000, 'Use at most 1000 characters').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'business') {
      if ((v.companyName ?? '').length < 2) {
        ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Company name must be at least 2 characters' })
      }
    } else if ((v.name ?? '').length < 2) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name must be at least 2 characters' })
    }
  })
  .transform(({ companyName, industry, companySize, description, ...rest }) =>
    rest.role === 'business'
      ? {
          ...rest,
          // Account ka naam = company ka naam (navbar, dashboard waghera mein yahi dikhta hai)
          name: companyName!.slice(0, 100),
          company: {
            companyName: companyName!,
            industry: industry || undefined,
            companySize: companySize || undefined,
            description: description || undefined,
          },
        }
      : { ...rest, name: rest.name!, company: undefined },
  )

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
