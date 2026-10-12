// Manager / agent (representative account) ki tasdeeq:
// pending  -> details bheji, admin dekhega
// approved -> verified manager: talents ke saath jur sakta hai
// rejected -> admin ne reject kiya, details theek kar ke dobara bhej sakta hai
export const MANAGER_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ManagerStatus = (typeof MANAGER_STATUSES)[number]

// Ye fields badlen to approved manager dobara review mein jata hai
export const MANAGER_IDENTITY_FIELDS = ['agencyName', 'websiteUrl', 'country'] as const

// Talent aur manager ka rishta (representation):
// invited   -> talent ne manager ko bulaya, manager ka jawab baqi
// requested -> manager ne talent ko represent karne ki darkhwast ki, talent ka jawab baqi
// active    -> jure hue: manager talent ki taraf se kaam kar sakta hai (ijazat ke mutabiq)
// declined  -> jis se poocha gaya us ne mana kar diya
// cancelled -> bhejne wale ne jawab se pehle wapas le li
// ended     -> kisi ek ne rishta khatam kiya (ya manager ki tasdeeq wapas hui)
export const REPRESENTATION_STATUSES = [
  'invited',
  'requested',
  'active',
  'declined',
  'cancelled',
  'ended',
] as const
export type RepresentationStatus = (typeof REPRESENTATION_STATUSES)[number]

export const OPEN_REPRESENTATION_STATUSES: RepresentationStatus[] = ['invited', 'requested', 'active']

// Talent har manager ko kya karne de:
// manageProfile -> profile, services aur availability badalna
// handleHires   -> hire requests ka jawab dena (accept / decline)
export const REPRESENTATION_PERMISSIONS = ['manageProfile', 'handleHires'] as const
export type RepresentationPermission = (typeof REPRESENTATION_PERMISSIONS)[number]
