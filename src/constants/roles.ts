// Platform ke saare account roles
export const ROLES = [
  'talent',
  'representative',
  'business',
  'agency',
  'organization',
  'admin',
] as const

export type Role = (typeof ROLES)[number]

// Signup pe ye roles chune ja sakte hain. Admin sirf database se banta hai
export const SIGNUP_ROLES = [
  'talent',
  'representative',
  'business',
  'agency',
  'organization',
] as const
