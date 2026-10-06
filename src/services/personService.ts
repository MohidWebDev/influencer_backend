import type { Model, Types } from 'mongoose'
import { Person } from '../models/Person'
import type { ITaxonomyItem } from '../models/taxonomy'
import { AppError } from '../utils/AppError'
import { slugify } from '../utils/slugify'

// Naam se unique slug: "hamid-mir", phir "hamid-mir-2", "hamid-mir-3" ...
export async function generateUniquePersonSlug(name: string) {
  const base = slugify(name) || 'person'
  let slug = base
  let counter = 2

  while (await Person.exists({ slug })) {
    slug = `${base}-${counter}`
    counter += 1
  }

  return slug
}

// ['journalist', 'tv-host'] -> ObjectIds. Koi slug na mile to error
export async function resolveTaxonomySlugs(
  TaxonomyModel: Model<ITaxonomyItem>,
  slugs: string[],
  field: string,
): Promise<Types.ObjectId[]> {
  if (slugs.length === 0) return []

  const items = await TaxonomyModel.find({ slug: { $in: slugs } }).select('_id slug')
  const found = new Set(items.map((item) => item.slug))
  const missing = slugs.filter((slug) => !found.has(slug))

  if (missing.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', {
      [field]: `Unknown ${field}: ${missing.join(', ')}`,
    })
  }

  return items.map((item) => item._id)
}
