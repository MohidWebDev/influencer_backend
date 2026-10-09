import type { Request, Response } from 'express'
import '../types/express'
import { User, type UserDocument } from '../models/User'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from '../utils/authCookies'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens'
import { Agreement } from '../models/Agreement'
import { BusinessProfile } from '../models/BusinessProfile'
import { HireRequest } from '../models/HireRequest'
import { Notification } from '../models/Notification'
import { Person } from '../models/Person'
import { ProfileClaim } from '../models/ProfileClaim'
import { writeAuditLog } from '../services/auditService'
import { parseOrThrow } from '../utils/validation'
import {
  changePasswordSchema,
  deleteAccountSchema,
  type LoginInput,
  type RegisterInput,
} from '../validators/authValidator'

// Naye access + refresh tokens bana kar cookies mein rakhta hai
export function issueTokens(res: Response, user: UserDocument) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role })
  const refreshToken = signRefreshToken({
    sub: user.id,
    tokenVersion: user.tokenVersion,
  })
  setAuthCookies(res, accessToken, refreshToken)
}

// POST /api/auth/register
export async function register(req: Request, res: Response) {
  const { name, email, password, role } = req.body as RegisterInput

  const exists = await User.exists({ email })
  if (exists) {
    throw new AppError(409, 'EMAIL_TAKEN', 'This email is already registered', {
      email: 'This email is already registered',
    })
  }

  const user = await User.create({ name, email, password, role })
  issueTokens(res, user)
  sendSuccess(res, { user }, 201)
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginInput

  const user = await User.findOne({ email }).select('+password +tokenVersion')
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
  }
  if (user.status === 'suspended') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended')
  }

  issueTokens(res, user)
  sendSuccess(res, { user })
}

// POST /api/auth/refresh -> access token expire ho jaye to naya lo
export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE]

  try {
    if (!token) throw new Error('No refresh token')
    const payload = verifyRefreshToken(token)
    const user = await User.findById(payload.sub).select('+tokenVersion')

    if (
      !user ||
      user.status !== 'active' ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new Error('Refresh token no longer valid')
    }

    issueTokens(res, user)
    sendSuccess(res, { user })
  } catch {
    clearAuthCookies(res)
    throw new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again')
  }
}

// POST /api/auth/logout -> is user ke saare refresh tokens bekaar
export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE]

  if (token) {
    try {
      const payload = verifyRefreshToken(token)
      await User.updateOne({ _id: payload.sub }, { $inc: { tokenVersion: 1 } })
    } catch {
      // Token pehle hi ghalat/expire hai, sirf cookies saaf kar do
    }
  }

  clearAuthCookies(res)
  sendSuccess(res, { loggedOut: true })
}

// GET /api/auth/me -> abhi login kaun hai
export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user!.id)
  if (!user || user.status !== 'active') {
    clearAuthCookies(res)
    throw new AppError(401, 'UNAUTHORIZED', 'Please log in')
  }
  sendSuccess(res, { user })
}

// PATCH /api/auth/password -> purana password check, naya set.
// Baqi saari devices se logout (tokenVersion +1), is device pe naye tokens
export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = parseOrThrow(changePasswordSchema, req.body ?? {})
  const user = await User.findById(req.user!.id).select('+password +tokenVersion')
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in')

  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Your current password is not correct', {
      currentPassword: 'Your current password is not correct',
    })
  }

  user.password = newPassword
  user.tokenVersion += 1
  await user.save()
  issueTokens(res, user)
  sendSuccess(res, { changed: true })
}

// DELETE /api/auth/account -> apna account hamesha ke liye mitao.
// Confirm mein "delete <naam>" likhna zaroori (bade/chhote huroof se farq nahi)
export async function deleteAccount(req: Request, res: Response) {
  const { confirm } = parseOrThrow(deleteAccountSchema, req.body ?? {})
  const user = await User.findById(req.user!.id)
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in')

  const expected = `delete ${user.name}`.trim().toLowerCase().replace(/\s+/g, ' ')
  if (confirm.toLowerCase().replace(/\s+/g, ' ') !== expected) {
    throw new AppError(400, 'CONFIRMATION_MISMATCH', 'The confirmation text does not match', {
      confirm: `Type "delete ${user.name}" to confirm`,
    })
  }

  // Aakhri active admin apna account nahi mita sakta
  if (user.role === 'admin') {
    const others = await User.countDocuments({
      role: 'admin',
      status: 'active',
      _id: { $ne: user._id },
    })
    if (others === 0) {
      throw new AppError(409, 'LAST_ADMIN', 'At least one active admin must remain')
    }
  }

  // Chalte (signed) muahide ke beech account nahi mit sakta: doosri taraf ka haq hai
  const party = { $or: [{ business: user._id }, { talent: user._id }] }
  if (await Agreement.exists({ ...party, status: { $in: ['active', 'disputed'] } })) {
    throw new AppError(
      409,
      'ACTIVE_AGREEMENT',
      'Finish or resolve your active agreements before deleting your account',
    )
  }

  // Record ke liye (actor ka email audit log mein mehfooz rehta hai)
  await writeAuditLog(req, {
    action: 'user.self_delete',
    targetType: 'user',
    targetId: user._id,
    targetLabel: user.email,
    before: { role: user.role, status: user.status },
  })

  // Talent ki profile wapas "unclaimed" (profile site pe rehti hai, bas maalik nahi)
  // Maalik gaya to us ki services / availability bhi (profile wapas aam public profile)
  await Person.updateMany(
    { claimedBy: user._id },
    {
      $set: { claimedBy: null, verified: false, services: [], status: 'public' },
      $unset: { availability: 1 },
    },
  )
  // Talent ki bheji hui chhupi (draft) profiles aur us ke claims / notifications mita do
  const drafts = await ProfileClaim.find({ user: user._id, isNewProfile: true }).select('person')
  await Person.deleteMany({
    _id: { $in: drafts.map((d) => d.person) },
    isDraft: true,
    claimedBy: null,
  })
  await ProfileClaim.deleteMany({ user: user._id })
  // Business ki company details aur bheji / aayi hui hire requests bhi
  await BusinessProfile.deleteMany({ owner: user._id })
  await HireRequest.deleteMany({ $or: [{ business: user._id }, { talent: user._id }] })
  // Jo muahide abhi sign nahi hue woh khatam; signed / mukammal muahide record ke liye rehte hain
  await Agreement.updateMany(
    { ...party, status: 'negotiating' },
    { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Account deleted' } },
  )
  await Notification.deleteMany({ recipient: user._id })
  await User.deleteOne({ _id: user._id })

  clearAuthCookies(res)
  sendSuccess(res, { deleted: true })
}
