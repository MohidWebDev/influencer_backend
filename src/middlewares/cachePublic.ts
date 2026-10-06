import type { Request, Response, NextFunction } from 'express'

// Public GET responses ko Vercel ke CDN pe cache karwata hai.
// s-maxage: itne second tak CDN khud jawab de, MongoDB tak request na jaye
// stale-while-revalidate: us ke baad bhi purana jawab foran do, aur peeche naya lao
// max-age=0: browser khud cache na kare (React Query frontend pe cache karta hai)
export function cachePublic(seconds: number, staleSeconds = seconds * 5) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set(
      'Cache-Control',
      `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`,
    )
    next()
  }
}
