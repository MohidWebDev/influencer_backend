import { Person } from '../models/Person'

// Report ke takedown pe profile chhupana (people module ka function)
export async function hidePerson(personId: unknown) {
  return Person.findByIdAndUpdate(
    personId,
    { $set: { visibility: 'hidden' } },
    { returnDocument: 'after' },
  )
}

// Admin dashboard ke numbers
export async function getPeopleStats() {
  const [total, hidden, claimed, verified] = await Promise.all([
    Person.countDocuments(),
    Person.countDocuments({ visibility: 'hidden' }),
    Person.countDocuments({ claimedBy: { $ne: null } }),
    Person.countDocuments({ verified: true }),
  ])
  return { total, hidden, claimed, verified }
}

export async function personExists(personId: unknown) {
  return Person.exists({ _id: personId, visibility: 'visible' })
}

// Rule: verified = claimed. Claim approve hote hi profile verified, maalik na ho to nahi.
// Purana data isi rule pe le aao (har bar chalana safe hai)
export async function syncVerifiedWithClaims() {
  await Person.updateMany({ claimedBy: null, verified: true }, { $set: { verified: false } })
  await Person.updateMany({ claimedBy: { $ne: null }, verified: false }, { $set: { verified: true } })
}
