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
import type { LoginInput, RegisterInput } from '../validators/authValidator'

// Naye access + refresh tokens bana kar cookies mein rakhta hai
function issueTokens(res: Response, user: UserDocument) {
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
