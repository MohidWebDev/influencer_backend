import app from './app'
import { env } from './config/env'

// Sirf local development ke liye. Vercel khud src/app.ts ka exported app use karta hai
app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`)
})
