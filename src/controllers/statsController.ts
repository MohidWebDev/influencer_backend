import type { Request, Response } from 'express'
import { HOME_CATEGORIES, type HomeCategory } from '../constants/homeCategories'
import { Person } from '../models/Person'
import { Profession } from '../models/taxonomy'
import { sendSuccess } from '../utils/apiResponse'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// GET /api/stats/home -> home page ke numbers aur categories (sirf public profiles)
export async function getHomeStats(_req: Request, res: Response) {
  const visible = { visibility: 'visible' as const }
  const since = new Date(Date.now() - WEEK_MS)

  const [profiles, newThisWeek, countries, verified] = await Promise.all([
    Person.countDocuments(visible),
    Person.countDocuments({ ...visible, createdAt: { $gte: since } }),
    Person.distinct('country', { ...visible, country: { $nin: [null, ''] } }),
    Person.countDocuments({ ...visible, verified: true }),
  ])

  // Har category: us ki professions mein se kisi ek wale public profiles
  const categories = await Promise.all(
    (Object.keys(HOME_CATEGORIES) as HomeCategory[]).map(async (key) => {
      const slugs = [...HOME_CATEGORIES[key]]
      const ids = await Profession.find({ slug: { $in: slugs } }).distinct('_id')
      const count = ids.length ? await Person.countDocuments({ ...visible, professions: { $in: ids } }) : 0
      return { key, slugs, count }
    }),
  )

  sendSuccess(res, {
    profiles,
    newThisWeek,
    countries: countries.length,
    verified,
    categories,
  })
}
