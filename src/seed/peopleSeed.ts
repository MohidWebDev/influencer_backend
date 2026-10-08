import type { Types } from 'mongoose'
import { Person } from '../models/Person'
import { PersonPhoto } from '../models/PersonPhoto'
import { ProfileClaim } from '../models/ProfileClaim'
import { Industry, Profession, Topic } from '../models/taxonomy'
import { resolveTaxonomySlugs } from '../services/personService'
import { REAL_PEOPLE, type RealPerson } from './realPeople'
import { fetchWikiPhoto } from './wikimediaPhotos'

// Demo profiles aur un ke claims saath mitao (warna claim ka person null reh jata hai)
export async function removeDemoPeople() {
  const ids = await Person.find({ isDemo: true }).distinct('_id')
  await ProfileClaim.deleteMany({ person: { $in: ids } })
  await PersonPhoto.deleteMany({ person: { $in: ids } })
  const { deletedCount } = await Person.deleteMany({ _id: { $in: ids } })
  return deletedCount
}

type PhotoOutcome = 'image' | 'fallback' | 'kept' | 'skipped'

// Ek asal shakhsiyat: slug se upsert. claimedBy / verified sirf pehli dafa set,
// taake dobara chalane pe kisi ka approve hua claim na mite
async function upsertRealPerson(real: RealPerson) {
  const [professions, industries, topics] = await Promise.all([
    resolveTaxonomySlugs(Profession, real.professions, 'professions'),
    resolveTaxonomySlugs(Industry, real.industries, 'industries'),
    resolveTaxonomySlugs(Topic, real.topics, 'topics'),
  ])
  return Person.findOneAndUpdate(
    { slug: real.slug },
    {
      $set: {
        name: real.name,
        headline: real.headline,
        bio: real.bio,
        country: real.country,
        professions,
        industries,
        topics,
        roles: ['talent'],
        status: 'public',
        visibility: 'visible',
        isDemo: false,
        isDraft: false,
        sourceRecords: [
          {
            sourceType: 'wikipedia',
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(real.wikiTitle)}`,
            retrievedAt: new Date(),
          },
        ],
      },
      $setOnInsert: { claimedBy: null, verified: false },
    },
    { upsert: true, returnDocument: 'after' },
  )
}

// Photo: Wikipedia lead image (sirf free license) -> MongoDB. Na mile to initials avatar
async function syncPhoto(personId: Types.ObjectId, real: RealPerson) {
  try {
    const result = await fetchWikiPhoto([real.wikiTitle, ...(real.altWikiTitles ?? [])])
    if (result.status !== 'ok') {
      await PersonPhoto.deleteMany({ person: personId })
      await Person.updateOne(
        { _id: personId },
        {
          $unset: { photoUrl: 1, photoCredit: 1 },
          // Mutabadil title ka article mila ho to source bhi wohi
          ...(result.status !== 'no-article' && { $set: { 'sourceRecords.0.url': result.pageUrl } }),
        },
      )
      return { outcome: 'fallback' as PhotoOutcome, note: result.reason }
    }
    const photo = await PersonPhoto.create({
      person: personId,
      data: result.data,
      contentType: result.contentType,
      width: result.width,
      bytes: result.data.length,
    })
    await Person.updateOne(
      { _id: personId },
      {
        $set: {
          photoUrl: `/api/people/photos/${photo.id}`,
          photoCredit: result.credit,
          'sourceRecords.0.url': result.pageUrl,
        },
      },
    )
    // Purani copies hatao (nayi id = naya cache)
    await PersonPhoto.deleteMany({ person: personId, _id: { $ne: photo._id } })
    const kb = Math.round(result.data.length / 1024)
    return { outcome: 'image' as PhotoOutcome, note: `${result.credit.license}, ${kb} KB` }
  } catch (error) {
    // Network ka masla: jo photo pehle se hai wohi rehne do
    return { outcome: 'kept' as PhotoOutcome, note: `Fetch failed (${(error as Error).message})` }
  }
}

export async function seedRealPeople(withPhotos: boolean) {
  const removed = await removeDemoPeople()
  console.log(`  Removed ${removed} dummy people`)

  const report: { name: string; slug: string; outcome: PhotoOutcome; note: string }[] = []
  for (const real of REAL_PEOPLE) {
    const person = await upsertRealPerson(real)
    const photo = withPhotos
      ? await syncPhoto(person._id, real)
      : { outcome: 'skipped' as PhotoOutcome, note: '--no-photos' }
    report.push({ name: real.name, slug: real.slug, ...photo })
    console.log(`  ${photo.outcome.padEnd(8)} ${real.name} (${photo.note})`)
    // Wikimedia pe bojh na daalo
    if (withPhotos && process.env.NODE_ENV !== 'test') await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const count = (outcome: PhotoOutcome) => report.filter((r) => r.outcome === outcome)
  console.log(`\n  Real people: ${REAL_PEOPLE.length}`)
  console.log(`  With image: ${count('image').length}`)
  const fallback = count('fallback')
  if (fallback.length) {
    console.log(`  Initials avatar: ${fallback.map((r) => `${r.name} (${r.note})`).join('; ')}`)
  }
  const kept = count('kept')
  if (kept.length) {
    console.log(`  Not updated, run again: ${kept.map((r) => r.name).join(', ')}`)
  }
}
