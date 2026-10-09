import type { Types } from 'mongoose'
import { Person } from '../models/Person'
import { PersonPhoto } from '../models/PersonPhoto'
import { ProfileClaim } from '../models/ProfileClaim'
import { ProfileRemoval } from '../models/ProfileRemoval'
import { Report } from '../models/Report'
import { notifyAdmins } from './notificationService'

// Claim ke waqt profile ki ye cheezen yaad rakhte hain (maalik inhi ko badal sakta hai)
const PUBLIC_FIELDS = [
  'headline',
  'bio',
  'photoUrl',
  'photoCredit',
  'websiteUrl',
  'languages',
  'country',
  'city',
  'socialAccounts',
  'totalFollowers',
  'professions',
  'industries',
  'topics',
] as const

// Claim approve hone se pehle ki public-source shakal mehfooz karo
export async function savePublicSnapshot(personId: Types.ObjectId | string) {
  const person = await Person.findById(personId).lean()
  if (!person) return
  const snapshot = Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, person[field] ?? null]))
  await Person.updateOne({ _id: personId }, { $set: { publicSnapshot: snapshot } })
}

export type ProfileOutcome = 'unclaimed' | 'hidden_for_review' | 'removal_requested' | 'deleted'

interface ReleaseOptions {
  removeProfile: boolean
  name: string
  email: string
}

async function deletePersonCompletely(personId: Types.ObjectId) {
  await ProfileClaim.deleteMany({ person: personId })
  await PersonPhoto.deleteMany({ person: personId })
  await Person.deleteOne({ _id: personId })
}

async function openReport(
  person: { _id: Types.ObjectId; name: string },
  reason: 'removal_request' | 'other',
  details: string,
  options: ReleaseOptions,
) {
  const report = await Report.create({
    person: person._id,
    reason,
    details,
    reporterName: options.name,
    reporterEmail: options.email,
    fromOwner: true,
  })
  await notifyAdmins({
    type: 'report.new',
    data: { person: person.name, reason },
    link: `/admin/reports/${String(report._id)}`,
  })
  return report
}

// Talent apna account mitaye to us ki profile ka kya ho:
// - khud banayi hui profile (public source se nahi) -> poori mit jati hai
// - public-source profile -> maalik ki saari cheezen hat kar wapas "unclaimed" (claim se pehle wali shakal)
//   * removeProfile: profile foran chhupi + admin ke liye removal request (seed dobara nahi banayega)
//   * purani claim jis ki snapshot nahi: chhupi, admin dekh kar dobara dikhaye
export async function releaseOwnedProfiles(
  userId: Types.ObjectId,
  options: ReleaseOptions,
): Promise<ProfileOutcome | null> {
  const people = await Person.find({ claimedBy: userId }).select('+publicSnapshot')
  let outcome: ProfileOutcome | null = null

  for (const person of people) {
    const selfCreated = await ProfileClaim.exists({
      user: userId,
      person: person._id,
      isNewProfile: true,
      status: 'approved',
    })
    if (selfCreated) {
      await deletePersonCompletely(person._id)
      outcome = 'deleted'
      continue
    }

    const snapshot = person.publicSnapshot
    const set: Record<string, unknown> = {
      claimedBy: null,
      verified: false,
      services: [],
      status: 'public',
      ...(snapshot ?? {}),
    }
    const unset: Record<string, 1> = { availability: 1, publicSnapshot: 1 }

    if (options.removeProfile) {
      set.visibility = 'hidden'
      const report = await openReport(
        person,
        'removal_request',
        'The owner of this profile deleted their account and asked for the profile to be removed. It is hidden until an admin decides.',
        options,
      )
      await ProfileRemoval.create({
        person: person._id,
        slug: person.slug,
        name: person.name,
        requestedByName: options.name,
        requestedByEmail: options.email,
        fromOwner: true,
        report: report._id,
      })
      outcome = 'removal_requested'
    } else if (!snapshot) {
      // Claim ki purani profile: asal shakal yaad nahi, is liye admin ke dekhne tak chhupi
      set.visibility = 'hidden'
      await openReport(
        person,
        'other',
        "The owner of this profile deleted their account. It may still show the owner's own edits, so it is hidden until an admin checks it and makes it visible again.",
        options,
      )
      outcome = 'hidden_for_review'
    } else {
      outcome = 'unclaimed'
    }

    await Person.updateOne({ _id: person._id }, { $set: set, $unset: unset })
  }
  return outcome
}

// Admin ne removal request pe profile hamesha ke liye mita di
export async function removeProfilePermanently(
  person: { _id: Types.ObjectId; slug: string; name: string },
  reportId: Types.ObjectId,
  adminId: string,
) {
  await deletePersonCompletely(person._id)
  const decided = { status: 'removed' as const, decidedAt: new Date(), decidedBy: adminId }
  const existing = await ProfileRemoval.findOneAndUpdate(
    { $or: [{ report: reportId }, { person: person._id, status: 'pending' }] },
    { $set: decided },
  )
  // Mehman ki removal request: abhi tak record nahi tha
  if (!existing) {
    await ProfileRemoval.create({
      person: person._id,
      slug: person.slug,
      name: person.name,
      report: reportId,
      ...decided,
    })
  }
}

// Seed:real in profiles ko dobara nahi banata (hatane ki request baqi ya mita di gayi)
export async function blockedSlugs() {
  const rows = await ProfileRemoval.find({ status: { $in: ['pending', 'removed'] } }).distinct('slug')
  return new Set(rows)
}
