import { z } from 'zod'
import { webUrl } from './common'
import { COMPANY_SIZES, ORGANIZATION_TYPES } from '../constants/business'

const email = z.email('Enter a valid email').trim().toLowerCase()
const password = z.string().min(8, 'Password must be at least 8 characters').max(100)
const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional()
const country = z
  .string('Choose a country')
  .trim()
  .regex(/^[A-Za-z]{2}$/, 'Choose a country')
  .transform((c) => c.toUpperCase())
// Khali chhor sakte hain, likha to sahi URL ho
const optionalUrl = z
  .union([webUrl('Enter a valid URL').trim(), z.literal('')])
  .optional()
  .transform((v) => v || undefined)
const personName = z
  .string('Name must be at least 2 characters')
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100)

// Signup ka form account type ke hisaab se alag:
// talent   -> sirf apna naam
// manager  -> naam + mulk (agency aur website optional)
// business -> organization ki qism + naam + mulk (website, industry, size, description optional)
const talentSignup = z.object({
  role: z.literal('talent'),
  name: personName,
  email,
  password,
})

const managerSignup = z.object({
  role: z.literal('representative'),
  name: personName,
  email,
  password,
  agencyName: optionalText(120),
  country,
  websiteUrl: optionalUrl,
})

const businessSignup = z.object({
  role: z.literal('business'),
  organizationType: z.enum(ORGANIZATION_TYPES, 'Choose the type of organization'),
  companyName: z
    .string('Name must be at least 2 characters')
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Use at most 120 characters'),
  email,
  password,
  country,
  websiteUrl: optionalUrl,
  industry: optionalText(80),
  companySize: z.enum([...COMPANY_SIZES, ''], 'Choose a company size').optional(),
  description: optionalText(1000),
})

export const registerSchema = z
  .discriminatedUnion('role', [talentSignup, managerSignup, businessSignup], {
    error: 'Choose a valid account type',
  })
  .transform((v) => {
    if (v.role === 'business') {
      const { companyName, organizationType, industry, companySize, description, country, websiteUrl, ...rest } = v
      return {
        ...rest,
        // Account ka naam = organization ka naam (navbar, dashboard waghera mein yahi dikhta hai)
        name: companyName.slice(0, 100),
        company: {
          organizationType,
          companyName,
          industry: industry || undefined,
          companySize: companySize || undefined,
          description: description || undefined,
          country,
          websiteUrl,
        },
        manager: undefined,
      }
    }
    if (v.role === 'representative') {
      const { agencyName, country, websiteUrl, ...rest } = v
      return {
        ...rest,
        company: undefined,
        manager: { agencyName: agencyName || undefined, country, websiteUrl },
      }
    }
    return { ...v, company: undefined, manager: undefined }
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
