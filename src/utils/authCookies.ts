import type { Response, CookieOptions } from 'express'
import { isProduction } from '../config/env'
import { ACCESS_TOKEN_MAX_AGE_MS, REFRESH_TOKEN_MAX_AGE_MS } from './tokens'

export const ACCESS_COOKIE = 'accessToken'
export const REFRESH_COOKIE = 'refreshToken'

// httpOnly -> JavaScript cookie ko parh nahi sakti (XSS se bachao)
const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
}

// Refresh cookie sirf /api/auth wali requests ke saath jati hai
const refreshPath = '/api/auth'

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions,
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  })
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions,
    path: refreshPath,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  })
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions, path: '/' })
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions, path: refreshPath })
}
