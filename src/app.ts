import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env'
import routes from './routes'
import healthRoutes from './routes/healthRoutes'
import { dbConnect } from './middlewares/dbConnect'
import { notFound } from './middlewares/notFound'
import { errorHandler } from './middlewares/errorHandler'

const app = express()

// Frontend (doosre domain) ko cookies ke saath request bhejne ki ijazat
app.use(cors({ origin: env.clientUrl, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Health check DB ke baghair bhi chalta hai
app.use('/api/health', healthRoutes)

// Baqi saari API routes se pehle MongoDB connect karo
app.use('/api', dbConnect, routes)

app.use(notFound)
app.use(errorHandler)

export default app
