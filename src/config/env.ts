import dotenv from 'dotenv'

dotenv.config({ quiet: true })

// Saare environment variables sirf yahan se parhe jate hain
export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  platformName: process.env.PLATFORM_NAME || 'Influence Platform',
}

export const isProduction = env.nodeEnv === 'production'
