/*
  Database mein starting data daalta hai.

  npm run seed              -> sirf taxonomy (professions, industries, topics)
  npm run seed:demo         -> taxonomy + farzi sample profiles
  npm run seed:clear-demo   -> sample profiles hata do
  npm run seed:real         -> farzi profiles hata kar 30 asal public profiles + Wikipedia photos
                               (dobara chalana safe hai: slug se upsert)
  npm run seed:real -- --no-photos   -> photos ke baghair (sirf text data)
*/
import mongoose, { type Model } from 'mongoose'
import { connectDB } from '../config/db'
import { Person } from '../models/Person'
import { Industry, Profession, Topic, type ITaxonomyItem } from '../models/taxonomy'
import { generateUniquePersonSlug, resolveTaxonomySlugs } from '../services/personService'
import { slugify } from '../utils/slugify'
import { DEMO_PEOPLE } from './demoPeople'
import { removeDemoPeople, seedRealPeople } from './peopleSeed'
import { INDUSTRIES, PROFESSIONS, TOPICS } from './taxonomyData'

async function upsertTaxonomy(TaxonomyModel: Model<ITaxonomyItem>, names: string[]) {
  // Upsert: hai to update, nahi to naya. Script baar baar chalana safe hai
  await TaxonomyModel.bulkWrite(
    names.map((name, index) => ({
      updateOne: {
        filter: { slug: slugify(name) },
        update: { $set: { name, order: index } },
        upsert: true,
      },
    })),
  )
  console.log(`  ${TaxonomyModel.modelName}: ${names.length}`)
}

async function seedDemoPeople() {
  await removeDemoPeople()

  for (const demo of DEMO_PEOPLE) {
    const [professions, industries, topics, slug] = await Promise.all([
      resolveTaxonomySlugs(Profession, demo.professions, 'professions'),
      resolveTaxonomySlugs(Industry, demo.industries, 'industries'),
      resolveTaxonomySlugs(Topic, demo.topics, 'topics'),
      generateUniquePersonSlug(demo.name),
    ])

    await Person.create({
      name: demo.name,
      slug,
      headline: demo.headline,
      bio: demo.bio,
      status: demo.status,
      professions,
      industries,
      topics,
      languages: demo.languages,
      country: demo.country,
      city: demo.city,
      verified: demo.verified ?? false,
      socialAccounts: demo.social.map((account) => ({
        ...account,
        handle: `@${slug}`,
        url: `https://example.com/demo/${account.platform}/${slug}`,
      })),
      sourceRecords: [{ sourceType: 'demo', note: 'Fictional sample profile for testing' }],
      isDemo: true,
    })
  }

  console.log(`  Demo people: ${DEMO_PEOPLE.length}`)
}

async function main() {
  const args = process.argv.slice(2)
  await connectDB()
  console.log(`Connected to ${mongoose.connection.name}`)

  if (args.includes('--clear-demo')) {
    const deletedCount = await removeDemoPeople()
    console.log(`Removed ${deletedCount} demo people`)
    return
  }

  console.log('Seeding taxonomy...')
  await upsertTaxonomy(Profession, PROFESSIONS)
  await upsertTaxonomy(Industry, INDUSTRIES)
  await upsertTaxonomy(Topic, TOPICS)

  if (args.includes('--real')) {
    console.log('Seeding real public profiles...')
    await seedRealPeople(!args.includes('--no-photos'))
  }

  if (args.includes('--demo')) {
    console.log('Seeding demo people...')
    await seedDemoPeople()
  }

  console.log('Done ✅')
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
