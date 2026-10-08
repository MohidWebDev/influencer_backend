import nodemailer, { type Transporter } from 'nodemailer'
import { env, isProduction } from '../config/env'
import { AppError } from '../utils/AppError'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

let transporter: Transporter | null = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      // 465 = seedha TLS, 587 = STARTTLS
      secure: env.smtpPort === 465,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    })
  }
  return transporter
}

export const isMailConfigured = () => Boolean(env.smtpHost)

// Email bhejta hai. SMTP set na ho to development mein terminal pe dikha deta hai
export async function sendMail(message: MailMessage) {
  if (!isMailConfigured()) {
    if (isProduction) {
      throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email service is not set up yet')
    }
    console.info(`[mail] To: ${message.to}\n[mail] Subject: ${message.subject}\n${message.text}`)
    return
  }

  try {
    await getTransporter().sendMail({
      from: env.mailFrom || `${env.platformName} <${env.smtpUser}>`,
      ...message,
    })
  } catch (error) {
    console.error('[mail] send failed', error)
    throw new AppError(503, 'EMAIL_FAILED', 'We could not send the email. Please try again')
  }
}
