// Hire request accept hone ke baad business aur talent ka likha hua muahida (agreement)
// negotiating -> shartein tay ho rahi hain; dono ne current version pe code se sign kiya to active
// active      -> kaam chal raha hai (milestones deliver / approve)
// disputed    -> kisi ne masla uthaya, admin faisla karega
// completed   -> saare milestones approve ho gaye
// cancelled   -> sign se pehle kisi ne wapas le liya, ya admin ne dispute mein khatam kiya
export const AGREEMENT_STATUSES = [
  'negotiating',
  'active',
  'disputed',
  'completed',
  'cancelled',
] as const
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number]

// Milestone: pending (kaam baqi) -> delivered (talent ne diya) -> approved (business ne mana)
export const MILESTONE_STATUSES = ['pending', 'delivered', 'approved'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export const AGREEMENT_PARTIES = ['business', 'talent'] as const
export type AgreementParty = (typeof AGREEMENT_PARTIES)[number]

// Admin dispute ka faisla: kaam jari, mukammal maan lo, ya khatam
export const DISPUTE_OUTCOMES = ['continue', 'complete', 'cancel'] as const
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number]

export const MAX_MILESTONES = 10
export const MAX_REVISIONS = 20

// Sign karne ka code email pe jata hai (password reset jaisa)
export const SIGN_CODE_MINUTES = 10
export const SIGN_RESEND_SECONDS = 60
export const MAX_SIGN_ATTEMPTS = 5
