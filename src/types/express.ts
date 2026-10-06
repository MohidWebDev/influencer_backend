import type { Role } from '../constants/roles'

// Login hua user requireAuth ke baad req.user mein milta hai
export interface AuthUser {
  id: string
  role: Role
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}
