import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { env } from './config/env'
import routes from './routes'
import healthRoutes from './routes/healthRoutes'
import { dbConnect } from './middlewares/dbConnect'
import { notFound } from './middlewares/notFound'
import { errorHandler } from './middlewares/errorHandler'
import { writeLimiter } from './middlewares/rateLimit'
import { sanitizeBody } from './middlewares/sanitize'

const app = express()

// Vercel / proxy ke peeche: req.ip aur https (secure cookies) sahi aayen
app.set('trust proxy', true)
// "X-Powered-By: Express" na batao
app.disable('x-powered-by')

// Security headers (HSTS, nosniff, frame-ancestors waghera). Profile photos doosri
// site pe bhi dikh sakein, is liye resource policy cross-origin
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

// Frontend (doosre domain) ko cookies ke saath request bhejne ki ijazat.
// CLIENT_URL mein kai domain comma se (jaise production + preview)
app.use(cors({ origin: env.clientUrls, credentials: true }))
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())
app.use(sanitizeBody)

// Health check DB ke baghair bhi chalta hai
app.use('/api/health', healthRoutes)

// Baqi saari API routes se pehle MongoDB connect karo
app.use('/api', dbConnect, writeLimiter, routes)

app.use(notFound)
app.use(errorHandler)

export default app
