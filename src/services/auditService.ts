import type { Request } from 'express'
import '../types/express'
import { AuditLog, type AuditTargetType } from '../models/AuditLog'
import { User } from '../models/User'

// Ye fields kabhi audit log mein nahi jaane chahiye
const SECRET_KEYS = new Set(['password', 'tokenVersion', 'codeHash', 'code', '__v'])

// Mongoose document / object ko saaf plain JSON banata hai, secrets hata kar
export function toAuditSnapshot(value: unknown): unknown {
  if (value === null || value === undefined) return value
  const plain = JSON.parse(JSON.stringify(value))
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip)
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(node)) {
        if (!SECRET_KEYS.has(key)) out[key] = strip(val)
      }
      return out
    }
    return node
  }
  return strip(plain)
}

interface AuditEntry {
  action: string
  targetType: AuditTargetType
  targetId?: unknown
  targetLabel?: string
  before?: unknown
  after?: unknown
}

// Ek admin action ko audit_logs mein likhta hai
export async function writeAuditLog(req: Request, entry: AuditEntry) {
  const actorId = req.user!.id
  const actor = await User.findById(actorId).select('email')
  await AuditLog.create({
    actor: actorId,
    actorEmail: actor?.email ?? 'unknown',
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ? String(entry.targetId) : undefined,
    targetLabel: entry.targetLabel,
    before: toAuditSnapshot(entry.before),
    after: toAuditSnapshot(entry.after),
    ip: req.ip,
  })
}
