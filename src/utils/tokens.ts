import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { Role } from '../constants/roles'

export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000 // 15 minute
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 din

export interface AccessPayload {
  sub: string
  role: Role
}

export interface RefreshPayload {
  sub: string
  tokenVersion: number
}

function getSecret(secret: string, name: string) {
  if (!secret) throw new Error(`${name} is not set in the environment`)
  return secret
}

export function signAccessToken(payload: AccessPayload) {
  return jwt.sign(payload, getSecret(env.jwtAccessSecret, 'JWT_ACCESS_SECRET'), {
    expiresIn: ACCESS_TOKEN_MAX_AGE_MS / 1000,
  })
}

export function signRefreshToken(payload: RefreshPayload) {
  return jwt.sign(payload, getSecret(env.jwtRefreshSecret, 'JWT_REFRESH_SECRET'), {
    expiresIn: REFRESH_TOKEN_MAX_AGE_MS / 1000,
  })
}

// Ghalat ya expire token pe error throw karta hai
export function verifyAccessToken(token: string) {
  return jwt.verify(
    token,
    getSecret(env.jwtAccessSecret, 'JWT_ACCESS_SECRET'),
  ) as AccessPayload
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(
    token,
    getSecret(env.jwtRefreshSecret, 'JWT_REFRESH_SECRET'),
  ) as RefreshPayload
}
