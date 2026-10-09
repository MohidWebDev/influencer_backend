import { CURRENCIES } from './services'

// Business ki tasdeeq (verification) ki halat
// pending  -> business ne details bheji, admin dekh raha hai
// approved -> verified business: sirf yahi verified talents ko hire kar sakta hai
// rejected -> admin ne reject kiya, business details theek kar ke dobara bhej sakta hai
export const BUSINESS_STATUSES = ['pending', 'approved', 'rejected'] as const
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]

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
