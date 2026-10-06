/*
  Kisi registered user ko admin banata hai:
  npm run make-admin -- someone@example.com
*/
import mongoose from 'mongoose'
import { connectDB } from '../config/db'
import { User } from '../models/User'

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email) throw new Error('Usage: npm run make-admin -- someone@example.com')

  await connectDB()
  const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { returnDocument: 'after' })
  if (!user) throw new Error(`No user found with email ${email}. Register first.`)

  console.log(`${user.email} is now an admin ✅ (log out and log in again)`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
