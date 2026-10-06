import type { Request, Response, NextFunction } from 'express'
import { connectDB } from '../config/db'

// Har request se pehle yakeeni banata hai ke MongoDB connected hai
export async function dbConnect(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  await connectDB()
  next()
}
