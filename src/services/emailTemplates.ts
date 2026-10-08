import { env } from '../config/env'
import type { MailMessage } from './mailService'

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Saari emails ka ek jaisa saaf dhancha (tables + inline styles: har email app mein chalta hai)
function layout(title: string, body: string) {
  const brand = escapeHtml(env.platformName)
  const year = new Date().getFullYear()
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="background:#111827;padding:22px 32px;">
<span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.2px;">${brand}</span>
</td></tr>
<tr><td style="padding:32px;">${body}</td></tr>
</table>
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">&copy; ${year} ${brand} &middot; This is an automated message from our support team.</p>
</td></tr>
</table>
</body>
</html>`
}

export function passwordResetCodeEmail(to: string, name: string, code: string, minutes: number): MailMessage {
  const subject = `${code} is your ${env.platformName} password reset code`
  const html = layout(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Reset your password</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">Hi ${escapeHtml(name)}, we received a request to reset the password for your account. Enter this code to continue:</p>
<div style="margin:0 0 24px;padding:20px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center;">
<span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#111827;">${code}</span>
</div>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4b5563;">This code expires in <strong>${minutes} minutes</strong> and can only be used once.</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">Didn't ask for this? You can safely ignore this email. Your password won't change. Never share this code with anyone, including our team.</p>`,
  )
  const text = `Hi ${name},

Your ${env.platformName} password reset code is: ${code}

It expires in ${minutes} minutes and can only be used once.
Didn't ask for this? Ignore this email. Your password won't change.`
  return { to, subject, html, text }
}

export function passwordChangedEmail(to: string, name: string): MailMessage {
  const subject = `Your ${env.platformName} password was changed`
  const html = layout(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Password changed</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">Hi ${escapeHtml(name)}, the password for your account was just reset. You've been signed out on all other devices.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">If this wasn't you, reset your password right away and contact our support team.</p>
<a href="${escapeHtml(env.clientUrl)}/forgot-password" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Secure my account</a>`,
  )
  const text = `Hi ${name},

The password for your ${env.platformName} account was just reset. You've been signed out on all other devices.
If this wasn't you, reset your password right away: ${env.clientUrl}/forgot-password`
  return { to, subject, html, text }
}
