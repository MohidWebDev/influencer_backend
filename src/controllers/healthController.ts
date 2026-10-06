import type { Request, Response } from 'express'
import { sendSuccess } from '../utils/apiResponse'

// GET /api/health -> server zinda hai ya nahi
export function getHealth(_req: Request, res: Response) {
  sendSuccess(res, { status: 'ok' })
}
