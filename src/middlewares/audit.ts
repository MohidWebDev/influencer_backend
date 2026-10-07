import type { Request, Response, NextFunction } from 'express'
import '../types/express'
import type { AuditTargetType } from '../models/AuditLog'
import { writeAuditLog } from '../services/auditService'

interface AuditOptions {
  // Action ka naam, jaise "person.update". Request dekh kar bhi ban sakta hai
  action: string | ((req: Request) => string)
  targetType: AuditTargetType
  // Kamyab jawab ke data mein se target nikalo (jaise data.person)
  pickTarget: (data: Record<string, unknown>) => unknown
  // Action se pehle ki halat
  loadBefore?: (req: Request) => Promise<unknown>
  // Sirf in halaat mein log karo (jaise owner ki edit admin action nahi)
  when?: (req: Request) => boolean
}

// Purane admin routes ke controllers ko chhere baghair unke actions record karta hai.
// Jawab bhejne se pehle res.json ko pakad kar audit log likhta hai
export function audit(options: AuditOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (options.when && !options.when(req)) return next()

    const before = options.loadBefore ? await options.loadBefore(req) : undefined
    const originalJson = res.json.bind(res)

    res.json = ((body: { success?: boolean; data?: Record<string, unknown> }) => {
      if (!body?.success || !body.data) return originalJson(body)

      const target = options.pickTarget(body.data) as
        | { _id?: unknown; name?: string; person?: { name?: string } }
        | undefined
      const action = typeof options.action === 'function' ? options.action(req) : options.action

      writeAuditLog(req, {
        action,
        targetType: options.targetType,
        targetId: target?._id ?? req.params.id,
        targetLabel: target?.name ?? target?.person?.name ?? (before as { name?: string })?.name,
        before,
        after: target,
      })
        .catch((error) => console.error('Audit log failed', error))
        .finally(() => originalJson(body))
      return res
    }) as Response['json']

    next()
  }
}
