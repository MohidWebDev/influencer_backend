import { Schema, model } from 'mongoose'

// Rate limit ki ginti: har key (limiter + IP / email / user) ki kitni requests is window mein.
// Vercel pe har request alag instance pe ja sakti hai, is liye memory ki jagah DB.
// resetAt guzarte hi MongoDB khud document mita deta hai (TTL)
const rateLimitHitSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    hits: { type: Number, required: true },
    resetAt: { type: Date, required: true },
  },
  { collection: 'rate_limit_hits', versionKey: false },
)

rateLimitHitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 })

export const RateLimitHit = model('RateLimitHit', rateLimitHitSchema)
