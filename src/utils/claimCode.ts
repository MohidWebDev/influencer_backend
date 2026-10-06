import crypto from 'node:crypto'

// 6 hindsay ka random code, jaise "482913"
export function generateClaimCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

// Code ko claim id ke saath hash karte hain, taake ek claim ka hash doosre pe kaam na kare
export function hashClaimCode(code: string, claimId: string) {
  return crypto.createHash('sha256').update(`${claimId}:${code}`).digest('hex')
}

// Barabar waqt mein compare (timing attack se bachao)
export function isClaimCodeValid(code: string, claimId: string, storedHash: string) {
  const given = Buffer.from(hashClaimCode(code, claimId), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return given.length === stored.length && crypto.timingSafeEqual(given, stored)
}
