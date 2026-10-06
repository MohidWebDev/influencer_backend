import type { Response } from 'express'

interface Meta {
  page: number
  limit: number
  total: number
}

// Har kamyab response isi shape mein jata hai:
// { success: true, data: {...}, meta: {...} }
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Meta,
) {
  return res.status(statusCode).json({ success: true, data, meta })
}

// Har error response isi shape mein jata hai:
// { success: false, error: { code, message, fields } }
export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  return res
    .status(statusCode)
    .json({ success: false, error: { code, message, fields } })
}
