// Talent kya kaam karta hai (service ki qism)
export const SERVICE_CATEGORIES = [
  'keynote',
  'brand_campaign',
  'sponsored_post',
  'podcast_guest',
  'event_appearance',
  'workshop',
  'consulting',
  'other',
] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]

// Kis kaam ke liye abhi khula hai
export const OPEN_TO = ['speaking', 'campaigns', 'podcasts', 'events'] as const
export type OpenTo = (typeof OPEN_TO)[number]

// Keemat: fixed, range, ya "quote mangwao"
export const PRICING_TYPES = ['fixed', 'range', 'quote'] as const
export const PRICE_UNITS = ['project', 'event', 'post', 'hour', 'day'] as const
export const CURRENCIES = ['PKR', 'USD', 'AED', 'SAR', 'GBP', 'EUR'] as const

// Kitni jaldi jawab deta hai
export const RESPONSE_TIMES = ['24h', '3d', '1w'] as const

export const MAX_SERVICES = 12
