import { isValidObjectId } from 'mongoose'
import { Person } from '../models/Person'
import { ProfileClaim } from '../models/ProfileClaim'

// Audit ke liye action se PEHLE ki halat (people / claims module ke andar)
export async function getPersonSnapshot(id: string) {
  if (!isValidObjectId(id)) return null
  return Person.findById(id).lean()
}

export async function getClaimSnapshot(id: string) {
  if (!isValidObjectId(id)) return null
  return ProfileClaim.findById(id).lean()
}
