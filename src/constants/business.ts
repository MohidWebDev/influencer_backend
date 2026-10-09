import { CURRENCIES } from './services'

// Business ki tasdeeq (verification), bilkul talent ke claim jaisi:
// pending              -> business ne details bheji, admin ko code bhejna hai
// waiting_for_business -> admin ne business ke kisi raabte (email, website, phone) pe code bheja
// otp_failed           -> business ne 5 dafa ghalat code daala, lock (admin dekhega)
// code_verified        -> sahi code daal diya, ab admin final approve karega
// approved             -> verified business: sirf yahi verified talents ko hire kar sakta hai
// rejected             -> admin ne reject kiya, business details theek kar ke dobara bhej sakta hai
export const BUSINESS_STATUSES = [
  'pending',
  'waiting_for_business',
  'otp_failed',
  'code_verified',
  'approved',
  'rejected',
] as const
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]

// Tasdeeq abhi chal rahi hai
export const OPEN_BUSINESS_STATUSES: BusinessStatus[] = [
  'pending',
  'waiting_for_business',
  'otp_failed',
  'code_verified',
]
// Jin pe admin ko kuch karna hai: code bhejna, lock dekhna, ya approve karna
export const NEEDS_ACTION_BUSINESS_STATUSES: BusinessStatus[] = [
  'pending',
  'otp_failed',
  'code_verified',
]

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const

// Ye fields badlen to approved business dobara review mein jata hai
export const BUSINESS_IDENTITY_FIELDS = [
  'companyName',
  'registrationNumber',
  'websiteUrl',
  'country',
] as const

// Hire request ki halat
// pending  -> business ne bheji, talent ka jawab baqi
// accepted / declined -> talent ka jawab
// cancelled -> business ne jawab se pehle wapas le li
export const HIRE_STATUSES = ['pending', 'accepted', 'declined', 'cancelled'] as const
export type HireStatus = (typeof HIRE_STATUSES)[number]

export const HIRE_CURRENCIES = CURRENCIES
