// Home page ke categories cards: har category kin professions (slugs) se banti hai.
// Search page pe bhi yahi slugs "profession=a,b,c" (koi bhi ek) ke saath khulte hain
export const HOME_CATEGORIES = {
  journalists: ['journalist', 'news-anchor', 'tv-host'],
  creators: ['content-creator', 'youtuber', 'tiktoker', 'podcaster', 'gamer-streamer'],
  speakers: ['public-speaker', 'coach', 'educator'],
  experts: ['doctor', 'scientist', 'lawyer', 'entrepreneur', 'ceo-executive'],
} as const

export type HomeCategory = keyof typeof HOME_CATEGORIES
