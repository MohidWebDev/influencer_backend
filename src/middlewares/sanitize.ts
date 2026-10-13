import type { Request, Response, NextFunction } from 'express'

// MongoDB operator injection se bachao: body mein "$" se shuru ya "." wali keys hata do
// (jaise { "email": { "$gt": "" } }). Zod pehle hi aksar rok leta hai; ye har route ke liye
// ek aur deewar hai. Query string Express 5 mein sirf text / list hoti hai, object nahi
function clean(value: unknown, depth = 0): unknown {
  if (depth > 20) return undefined
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1))
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      out[key] = clean(inner, depth + 1)
    }
    return out
  }
  return value
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body)
  next()
}
