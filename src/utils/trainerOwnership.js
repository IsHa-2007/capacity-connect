import { trainers } from '../data/mockData'

// A trainer's auth/user account id (e.g. 'u2') may differ from the trainer
// profile id used to key their courses (e.g. 'tr1'). The trainer profile
// carries a `userId` link back to the account. Courses owned by that trainer
// are stored under the profile id, so ownership checks must accept both ids.
//
// Returns the owning trainer id for a given auth user id. When no link exists,
// the user id itself is used so accounts and profiles that share ids still work.
export function trainerIdForUser(userId) {
  if (!userId) return null
  const linked = trainers.find((t) => t.userId === userId)
  return linked ? linked.id : userId
}

// Set of ids that identify courses owned by a given auth user: their own id
// plus any linked trainer profile ids.
export function ownedTrainerIds(userId) {
  if (!userId) return new Set()
  const ids = new Set([userId])
  const profile = trainers.find((t) => t.userId === userId)
  if (profile) ids.add(profile.id)
  return ids
}