import type { Request } from 'express'
import { isValidObjectId, type Types } from 'mongoose'
import '../types/express'
import type { RepresentationPermission } from '../constants/manager'
import { ManagerProfile } from '../models/ManagerProfile'
import { Person } from '../models/Person'
import { Representation } from '../models/Representation'
import { AppError } from '../utils/AppError'

type Id = Types.ObjectId | string

// Kya ye verified (approved) manager hai
export async function isApprovedManager(userId: Id) {
  return Boolean(await ManagerProfile.exists({ owner: userId, status: 'approved' }))
}

// Is profile ka chalta hua rishta (ek waqt mein ek). Profile ab us talent ki na rahi ho to kuch nahi
export async function activeRepresentation(personId: Id) {
  const rep = await Representation.findOne({ person: personId, status: 'active' })
  if (!rep) return null
  const person = await Person.findById(personId).select('claimedBy')
  if (!person?.claimedBy || String(person.claimedBy) !== String(rep.talent)) return null
  return rep
}

// Manager kis talent ke liye ye kaam kar sakta hai? Nahi to 403
export async function assertCanActFor(managerId: Id, personId: Id, permission: RepresentationPermission) {
  const rep = await activeRepresentation(personId)
  if (!rep || String(rep.manager) !== String(managerId)) {
    throw new AppError(403, 'NOT_YOUR_TALENT', 'You do not represent this talent')
  }
  if (!rep.permissions[permission]) {
    throw new AppError(403, 'NO_PERMISSION', 'This talent has not allowed you to do this')
  }
  if (!(await isApprovedManager(managerId))) {
    throw new AppError(403, 'MANAGER_NOT_VERIFIED', 'Your manager account is not verified')
  }
  return rep
}

// Talent ka apna kaam, ya manager us ki taraf se (?person=<profile id>).
// Wapas: kis talent (user) ki taraf se aur kaun sa profile
export async function resolveTalentActor(req: Request, permission: RepresentationPermission) {
  const user = req.user!
  if (user.role === 'talent') {
    return { talentId: user.id, personId: null as string | null, managerId: null as string | null }
  }
  const personId = String(req.query.person ?? '')
  if (user.role !== 'representative' || !isValidObjectId(personId)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this')
  }
  const rep = await assertCanActFor(user.id, personId, permission)
  return { talentId: String(rep.talent), personId, managerId: user.id }
}

// Kisi talent ka manager jise ye ijazat hai (notification ke liye), warna null
export async function managerWith(personId: Id, permission: RepresentationPermission) {
  const rep = await activeRepresentation(personId)
  if (!rep || !rep.permissions[permission]) return null
  return (await isApprovedManager(rep.manager)) ? rep.manager : null
}

// Profile edit (PATCH /api/people/:id) mein: kya ye manager is profile ko badal sakta hai
export async function canManageProfile(managerId: Id, personId: Id) {
  try {
    await assertCanActFor(managerId, personId, 'manageProfile')
    return true
  } catch {
    return false
  }
}

// Manager ke woh talents (profiles) jin ke liye us ke paas ye ijazat hai (aur rishta abhi sahi hai)
export async function managedPersons(managerId: Id, permission: RepresentationPermission) {
  const reps = await Representation.find({
    manager: managerId,
    status: 'active',
    [`permissions.${permission}`]: true,
  }).select('person')
  const allowed: Types.ObjectId[] = []
  for (const rep of reps) {
    try {
      await assertCanActFor(managerId, rep.person, permission)
      allowed.push(rep.person)
    } catch {
      // Rishta ab kaam ka nahi (profile badli / manager unverified)
    }
  }
  return allowed
}
