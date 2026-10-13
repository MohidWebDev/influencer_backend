// Platform ke saare account roles. Business = koi bhi company / brand / agency / NGO
// (kis qism ki hai woh company.organizationType batata hai)
export const ROLES = ['talent', 'representative', 'business', 'admin'] as const

export type Role = (typeof ROLES)[number]

// Signup pe ye roles chune ja sakte hain. Admin sirf database se banta hai
export const SIGNUP_ROLES = ['talent', 'representative', 'business'] as const

// Purane roles jo ab business mein mil gaye (DB connect pe migrate hote hain)
export const LEGACY_BUSINESS_ROLES = {
  agency: 'marketing_agency',
  organization: 'other',
} as const
