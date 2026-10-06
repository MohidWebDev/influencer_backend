import type { Request, Response, NextFunction } from 'express'

// Public GET responses ko Vercel ke CDN pe cache karwata hai.
// CDN-Cache-Control sirf CDN parhta hai (browser nahi):
//   max-age: itne second tak CDN khud jawab de, MongoDB tak request na jaye
//   stale-while-revalidate: us ke baad bhi purana jawab foran do, aur peeche naya lao
// Cache-Control browser ke liye hai: har dafa server se poocho.
// (Browser mein caching React Query karta hai)
export function cachePublic(seconds: number, staleSeconds = seconds * 5) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'public, max-age=0, must-revalidate')
    res.set('CDN-Cache-Control', `max-age=${seconds}, stale-while-revalidate=${staleSeconds}`)
    next()
  }
}
