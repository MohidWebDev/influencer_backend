import { Resend } from 'resend'
import { env, isProduction } from '../config/env'
import { AppError } from '../utils/AppError'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

// Resend ka test sender: domain verify hone tak sirf apne Resend account ke email pe bhejta hai
const RESEND_TEST_SENDER = 'onboarding@resend.dev'

let client: Resend | null = null

function getClient() {
  client ??= new Resend(env.resendApiKey)
  return client
}

export const isMailConfigured = () => Boolean(env.resendApiKey)

// Email Resend se bhejta hai. API key set na ho to development mein terminal pe dikha deta hai
export async function sendMail(message: MailMessage) {
  if (!isMailConfigured()) {
    if (isProduction) {
      throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email service is not set up yet')
    }
    console.info(`[mail] To: ${message.to}\n[mail] Subject: ${message.subject}\n${message.text}`)
    return
  }

  // Resend error throw nahi karta, { error } wapas deta hai
  const { error } = await getClient()
    .emails.send({
      from: env.mailFrom || `${env.platformName} <${RESEND_TEST_SENDER}>`,
      ...message,
    })
    .catch((networkError: unknown) => ({ error: networkError }))

  if (error) {
    console.error('[mail] send failed', error)
    throw new AppError(503, 'EMAIL_FAILED', 'We could not send the email. Please try again')
  }
}
