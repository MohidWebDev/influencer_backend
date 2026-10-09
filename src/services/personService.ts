import type { Model, Types } from 'mongoose'
import { Person } from '../models/Person'
import type { ITaxonomyItem } from '../models/taxonomy'
import { AppError } from '../utils/AppError'
import { slugify } from '../utils/slugify'
import { savePublicSnapshot } from './profileOwnershipService'

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

// Claim approve hone pe Person ka maalik set karta hai, aur profile khud verified ho jati hai.
// Sirf tab jab profile pehle se kisi aur ki na ho (dono admin ek saath approve karein to bhi safe)
export async function setPersonOwner(personId: Types.ObjectId | string, userId: Types.ObjectId | string) {
  const person = await Person.findOneAndUpdate(
    { _id: personId, claimedBy: null },
    { $set: { claimedBy: userId, verified: true } },
    { returnDocument: 'after' },
  )
  if (!person) {
    throw new AppError(409, 'ALREADY_CLAIMED', 'This profile has already been claimed')
  }

  // Maalik ke edit karne se pehle ki public-source shakal (account mitane pe wapas aati hai)
  if (!person.isDraft) await savePublicSnapshot(person._id)

  // Document: claim hone ke baad profile "public" se "contactable" ho jati hai
  if (person.status === 'public') {
    person.status = 'contactable'
    await person.save()
  }
  return person
}
