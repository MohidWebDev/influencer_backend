import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import { User } from '../models/User'
import { PasswordReset } from '../models/PasswordReset'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { generateClaimCode } from '../utils/claimCode'
import { parseOrThrow } from '../utils/validation'
import { sendMail } from '../services/mailService'
import { passwordChangedEmail, passwordResetCodeEmail } from '../services/emailTemplates'
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
} from '../validators/authValidator'
import { issueTokens } from './authController'

export const RESET_CODE_MINUTES = 10
export const RESEND_SECONDS = 60
export const MAX_CODE_ATTEMPTS = 5
const RESET_TOKEN_MINUTES = 15

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000)

// User id ke saath hash: ek user ka hash doosre pe kaam nahi karta
const hashSecret = (secret: string, userId: string) =>
  crypto.createHash('sha256').update(`${userId}:${secret}`).digest('hex')

function sameHash(a: string, b?: string) {
  if (!b || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

const invalidCode = (attemptsLeft?: number) =>
  new AppError(
    400,
    'INVALID_CODE',
    'This code is not correct',
    { code: 'This code is not correct' },
    attemptsLeft === undefined ? undefined : { attemptsLeft },
  )

// POST /api/auth/forgot-password -> email pe 6 hindsay ka code.
// Jawab hamesha ek jaisa, taake koi ye na jaan sake ke kaun sa email registered hai
export async function forgotPassword(req: Request, res: Response) {
  const { email } = parseOrThrow(forgotPasswordSchema, req.body ?? {})
  const reply = () =>
    sendSuccess(res, { sent: true, resendIn: RESEND_SECONDS, expiresIn: RESET_CODE_MINUTES * 60 })

  const user = await User.findOne({ email, status: 'active' })
  if (!user) return reply()

  // Bar bar bhejne se roko
  const existing = await PasswordReset.findOne({ user: user._id })
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_SECONDS * 1000) {
    return reply()
  }

  const code = generateClaimCode()
  await PasswordReset.findOneAndUpdate(
    { user: user._id },
    {
      $set: {
        codeHash: hashSecret(code, user.id),
        attempts: 0,
        lastSentAt: new Date(),
        expiresAt: minutesFromNow(RESET_CODE_MINUTES),
      },
      $unset: { resetTokenHash: 1 },
    },
    { upsert: true },
  )

  try {
    await sendMail(passwordResetCodeEmail(user.email, user.name, code, RESET_CODE_MINUTES))
  } catch (error) {
    // Email nahi gaya to request bhi khatam, taake user foran dobara try kar sake
    await PasswordReset.deleteOne({ user: user._id })
    throw error
  }
  reply()
}

// POST /api/auth/forgot-password/verify -> code sahi ho to reset token milta hai
export async function verifyResetCode(req: Request, res: Response) {
  const { email, code } = parseOrThrow(verifyResetCodeSchema, req.body ?? {})

  const user = await User.findOne({ email, status: 'active' })
  const request = user && (await PasswordReset.findOne({ user: user._id }))
  if (!user || !request?.codeHash) throw invalidCode()
  if (request.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'CODE_EXPIRED', 'This code has expired. Request a new one')
  }
  if (request.attempts >= MAX_CODE_ATTEMPTS) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong attempts. Request a new code')
  }

  if (!sameHash(hashSecret(code, user.id), request.codeHash)) {
    request.attempts += 1
    await request.save()
    const attemptsLeft = MAX_CODE_ATTEMPTS - request.attempts
    if (attemptsLeft <= 0) {
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong attempts. Request a new code')
    }
    throw invalidCode(attemptsLeft)
  }

  // Code ek hi dafa chalta hai; ab thodi der ke liye reset token
  const resetToken = crypto.randomBytes(32).toString('hex')
  request.codeHash = undefined
  request.resetTokenHash = hashSecret(resetToken, user.id)
  request.expiresAt = minutesFromNow(RESET_TOKEN_MINUTES)
  await request.save()
  sendSuccess(res, { resetToken, expiresIn: RESET_TOKEN_MINUTES * 60 })
}

// POST /api/auth/reset-password -> naya password, sab devices se logout, is device pe login
export async function resetPassword(req: Request, res: Response) {
  const { email, resetToken, newPassword } = parseOrThrow(resetPasswordSchema, req.body ?? {})

  const user = await User.findOne({ email, status: 'active' }).select('+password +tokenVersion')
  const request = user && (await PasswordReset.findOne({ user: user._id }))
  if (
    !user ||
    !request ||
    request.expiresAt.getTime() < Date.now() ||
    !sameHash(hashSecret(resetToken, user.id), request.resetTokenHash)
  ) {
    throw new AppError(400, 'RESET_EXPIRED', 'This reset session has expired. Start again')
  }

  user.password = newPassword
  user.tokenVersion += 1
  await user.save()
  await PasswordReset.deleteOne({ _id: request._id })
  issueTokens(res, user)

  // Khabar ki email: na jaye to bhi password badal chuka hai
  await sendMail(passwordChangedEmail(user.email, user.name)).catch(() => undefined)
  sendSuccess(res, { user })
}
