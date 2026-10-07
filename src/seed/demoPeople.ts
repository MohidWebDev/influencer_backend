import type { ProfileStatus, SocialPlatform } from '../constants/people'

// Ye sab FARZI (fictional) log hain, sirf testing ke liye.
// Asal logon ka data sirf public sources / research sheet se aayega
export interface DemoPerson {
  name: string
  headline: string
  bio: string
  status: ProfileStatus
  professions: string[]
  industries: string[]
  topics: string[]
  languages: string[]
  country: string
  city: string
  verified?: boolean
  social: { platform: SocialPlatform; followers: number; engagementRate?: number }[]
}

export const DEMO_PEOPLE: DemoPerson[] = [
  {
    name: 'Sana Rafiq',
    headline: 'Tech journalist covering AI and startups in Pakistan',
    bio: 'Sample profile for testing. Writes weekly columns on artificial intelligence, the startup ecosystem and digital policy.',
    status: 'hireable',
    professions: ['journalist', 'public-speaker'],
    industries: ['technology', 'media-news'],
    topics: ['artificial-intelligence', 'startups'],
    languages: ['en', 'ur'],
    country: 'PK',
    city: 'Lahore',
    social: [
      { platform: 'x', followers: 84000, engagementRate: 2.1 },
      { platform: 'linkedin', followers: 41000, engagementRate: 3.4 },
    ],
  },
  {
    name: 'Bilal Ahmed Qazi',
    headline: 'Prime-time news anchor and political analyst',
    bio: 'Sample profile for testing. Hosts a nightly current affairs show and moderates panel discussions.',
    status: 'represented',
    professions: ['news-anchor', 'tv-host'],
    industries: ['media-news', 'politics-government'],
    topics: ['politics', 'current-affairs', 'economy'],
    languages: ['ur', 'en'],
    country: 'PK',
    city: 'Islamabad',
    social: [
      { platform: 'x', followers: 1200000, engagementRate: 1.2 },
      { platform: 'youtube', followers: 650000, engagementRate: 4.0 },
    ],
  },
  {
    name: 'Hira Mansoor',
    headline: 'Food creator exploring street food across Pakistan',
    bio: 'Sample profile for testing. Short videos about street food, home cooking and food travel.',
    status: 'hireable',
    professions: ['content-creator', 'chef'],
    industries: ['food-hospitality', 'travel-tourism'],
    topics: ['street-food', 'cooking', 'travel'],
    languages: ['ur', 'en', 'pa'],
    country: 'PK',
    city: 'Karachi',
    social: [
      { platform: 'instagram', followers: 520000, engagementRate: 5.8 },
      { platform: 'tiktok', followers: 900000, engagementRate: 7.2 },
    ],
  },
  {
    name: 'Dr. Kamran Yousaf',
    headline: 'Psychiatrist talking about mental health in plain Urdu',
    bio: 'Sample profile for testing. Runs awareness sessions in universities and a weekly mental health podcast.',
    status: 'contactable',
    professions: ['doctor', 'podcaster'],
    industries: ['health-medicine', 'education'],
    topics: ['mental-health', 'public-health', 'youth'],
    languages: ['ur', 'en'],
    country: 'PK',
    city: 'Lahore',
    social: [
      { platform: 'youtube', followers: 230000, engagementRate: 3.9 },
      { platform: 'podcast', followers: 45000 },
    ],
  },
  {
    name: 'Zara Siddiqui',
    headline: 'Founder and keynote speaker on women in tech',
    bio: 'Sample profile for testing. Founded a coding bootcamp for women and speaks at tech conferences.',
    status: 'hireable',
    professions: ['entrepreneur', 'public-speaker'],
    industries: ['technology', 'education'],
    topics: ['women-empowerment', 'entrepreneurship', 'software-development'],
    languages: ['en', 'ur'],
    country: 'PK',
    city: 'Karachi',
    social: [
      { platform: 'linkedin', followers: 98000, engagementRate: 4.5 },
      { platform: 'instagram', followers: 60000, engagementRate: 3.1 },
    ],
  },
  {
    name: 'Usman Tariq',
    headline: 'Former first-class cricketer and sports commentator',
    bio: 'Sample profile for testing. Commentates domestic cricket and runs coaching clinics for juniors.',
    status: 'represented',
    professions: ['athlete', 'coach'],
    industries: ['sports', 'media-news'],
    topics: ['cricket', 'fitness', 'youth'],
    languages: ['ur', 'en'],
    country: 'PK',
    city: 'Faisalabad',
    social: [
      { platform: 'instagram', followers: 310000, engagementRate: 3.6 },
      { platform: 'x', followers: 150000, engagementRate: 1.9 },
    ],
  },
  {
    name: 'Mehwish Jamil',
    headline: 'Personal finance educator making investing simple',
    bio: 'Sample profile for testing. Teaches budgeting and investing through YouTube and workshops.',
    status: 'hireable',
    professions: ['content-creator', 'educator'],
    industries: ['business-finance', 'education'],
    topics: ['personal-finance', 'investing', 'freelancing'],
    languages: ['ur', 'en'],
    country: 'PK',
    city: 'Islamabad',
    social: [
      { platform: 'youtube', followers: 410000, engagementRate: 6.1 },
      { platform: 'instagram', followers: 120000, engagementRate: 4.2 },
    ],
  },
  {
    name: 'Ali Raza Shah',
    headline: 'Stand-up comedian and sketch writer',
    bio: 'Sample profile for testing. Performs stand-up across Pakistan and writes comedy sketches online.',
    status: 'public',
    professions: ['comedian', 'actor'],
    industries: ['entertainment'],
    topics: ['comedy', 'drama'],
    languages: ['ur', 'pa'],
    country: 'PK',
    city: 'Lahore',
    social: [
      { platform: 'youtube', followers: 780000, engagementRate: 5.0 },
      { platform: 'tiktok', followers: 1500000, engagementRate: 8.3 },
    ],
  },
  {
    name: 'Fatima Noor',
    headline: 'Qawwali and Sufi music vocalist',
    bio: 'Sample profile for testing. Performs at festivals and cultural events in Pakistan and the Gulf.',
    status: 'hireable',
    professions: ['musician'],
    industries: ['music', 'art-culture'],
    topics: ['qawwali', 'poetry'],
    languages: ['ur', 'pa'],
    country: 'PK',
    city: 'Multan',
    social: [
      { platform: 'youtube', followers: 560000, engagementRate: 4.4 },
      { platform: 'facebook', followers: 300000, engagementRate: 2.0 },
    ],
  },
  {
    name: 'Omar Al Hashimi',
    headline: 'Dubai-based tech reviewer and gaming streamer',
    bio: 'Sample profile for testing. Reviews gadgets in Arabic and English and streams esports tournaments.',
    status: 'hireable',
    professions: ['youtuber', 'gamer-streamer'],
    industries: ['technology', 'gaming'],
    topics: ['esports', 'social-media'],
    languages: ['ar', 'en'],
    country: 'AE',
    city: 'Dubai',
    social: [
      { platform: 'youtube', followers: 1900000, engagementRate: 3.3 },
      { platform: 'twitch', followers: 240000, engagementRate: 6.5 },
    ],
  },
  {
    name: 'Nadia Al Saud',
    headline: 'Fashion designer and modest fashion creator',
    bio: 'Sample profile for testing. Designs modest wear collections and shares styling tips.',
    status: 'contactable',
    professions: ['fashion-designer', 'content-creator'],
    industries: ['fashion-beauty'],
    topics: ['fashion-trends', 'skincare'],
    languages: ['ar', 'en'],
    country: 'SA',
    city: 'Riyadh',
    social: [
      { platform: 'instagram', followers: 870000, engagementRate: 4.9 },
      { platform: 'snapchat', followers: 400000 },
    ],
  },
  {
    name: 'Ahmed Rehan',
    headline: 'Author and historian of the subcontinent',
    bio: 'Sample profile for testing. Writes books on South Asian history and gives public lectures.',
    status: 'public',
    professions: ['author', 'educator'],
    industries: ['education', 'art-culture'],
    topics: ['history', 'books', 'urdu-literature'],
    languages: ['ur', 'en'],
    country: 'PK',
    city: 'Peshawar',
    social: [{ platform: 'facebook', followers: 95000, engagementRate: 2.7 }],
  },
]
