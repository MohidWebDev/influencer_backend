import type { Express } from 'express'
import request from 'supertest'
import { loginAs, setupApp, teardownDb } from './helpers'

// Asal email nahi bhejni: bheji hui emails yahan jama hoti hain
const sent: { to: string; subject: string; text: string }[] = []
jest.mock('../src/services/mailService', () => ({
  isMailConfigured: () => true,
  sendMail: jest.fn(async (message: { to: string; subject: string; text: string }) => {
    sent.push(message)
  }),
}))

let app: Express

beforeAll(async () => {
  app = await setupApp('password_reset')
})
afterAll(teardownDb)

const codeFor = (email: string) => {
  const mail = [...sent].reverse().find((m) => m.to === email && /reset code/.test(m.subject))
  return mail?.text.match(/\b(\d{6})\b/)?.[1] ?? ''
}

// Purana request ka resend cooldown khatam kar do
async function expireCooldown(userId: unknown) {
  const { PasswordReset } = await import('../src/models/PasswordReset')
  await PasswordReset.updateOne({ user: userId }, { $set: { lastSentAt: new Date(0) } })
}

describe('forgot password', () => {
  it('emails a code, verifies it once and resets the password', async () => {
    const { agent: oldDevice, user } = await loginAs(app, 'talent')

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: user.email.toUpperCase() })
    expect(forgot.status).toBe(200)
    expect(forgot.body.data.resendIn).toBe(60)
    const code = codeFor(user.email)
    expect(code).toMatch(/^\d{6}$/)

    const wrong = await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ email: user.email, code: code === '000000' ? '111111' : '000000' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.code).toBe('INVALID_CODE')
    expect(wrong.body.error.details.attemptsLeft).toBe(4)

    const verify = await request(app).post('/api/auth/forgot-password/verify').send({ email: user.email, code })
    expect(verify.status).toBe(200)
    const { resetToken } = verify.body.data
    expect(resetToken).toBeTruthy()

    // Code ek hi dafa chalta hai
    const again = await request(app).post('/api/auth/forgot-password/verify').send({ email: user.email, code })
    expect(again.status).toBe(400)

    const badToken = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: user.email, resetToken: 'abc', newPassword: 'brandnew123' })
    expect(badToken.body.error.code).toBe('RESET_EXPIRED')

    const device = request.agent(app)
    const reset = await device
      .post('/api/auth/reset-password')
      .send({ email: user.email, resetToken, newPassword: 'brandnew123' })
    expect(reset.status).toBe(200)
    // Is device pe login, purani device logout
    expect((await device.get('/api/auth/me')).status).toBe(200)
    expect((await oldDevice.post('/api/auth/refresh')).status).toBe(401)
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'brandnew123' })).status).toBe(200)
    // Token dobara nahi chalta, aur khabar ki email gayi
    const reuse = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: user.email, resetToken, newPassword: 'another1234' })
    expect(reuse.status).toBe(400)
    expect(sent.some((m) => m.to === user.email && /was changed/.test(m.subject))).toBe(true)
  })

  it('gives the same answer for unknown emails and sends nothing', async () => {
    const before = sent.length
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@nowhere.com' })
    expect(res.status).toBe(200)
    expect(res.body.data.sent).toBe(true)
    expect(sent.length).toBe(before)
    const verify = await request(app).post('/api/auth/forgot-password/verify').send({ email: 'nobody@nowhere.com', code: '123456' })
    expect(verify.body.error.code).toBe('INVALID_CODE')
  })

  it('does not email suspended users and waits before resending', async () => {
    const { user: suspended } = await loginAs(app, 'talent', { status: 'suspended' })
    await request(app).post('/api/auth/forgot-password').send({ email: suspended.email })
    expect(codeFor(suspended.email)).toBe('')

    const { user } = await loginAs(app, 'admin')
    await request(app).post('/api/auth/forgot-password').send({ email: user.email })
    await request(app).post('/api/auth/forgot-password').send({ email: user.email })
    expect(sent.filter((m) => m.to === user.email).length).toBe(1)
    await expireCooldown(user._id)
    await request(app).post('/api/auth/forgot-password').send({ email: user.email })
    expect(sent.filter((m) => m.to === user.email).length).toBe(2)
  })

  it('locks the code after 5 wrong tries', async () => {
    const { user } = await loginAs(app, 'talent')
    await request(app).post('/api/auth/forgot-password').send({ email: user.email })
    const code = codeFor(user.email)
    const wrongCode = code === '999999' ? '888888' : '999999'
    let last
    for (let i = 0; i < 5; i += 1) {
      last = await request(app).post('/api/auth/forgot-password/verify').send({ email: user.email, code: wrongCode })
    }
    expect(last!.status).toBe(429)
    const right = await request(app).post('/api/auth/forgot-password/verify').send({ email: user.email, code })
    expect(right.body.error.code).toBe('TOO_MANY_ATTEMPTS')
  })

  it('rejects an expired code', async () => {
    const { user } = await loginAs(app, 'talent')
    await request(app).post('/api/auth/forgot-password').send({ email: user.email })
    const { PasswordReset } = await import('../src/models/PasswordReset')
    await PasswordReset.updateOne({ user: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await request(app).post('/api/auth/forgot-password/verify').send({ email: user.email, code: codeFor(user.email) })
    expect(res.body.error.code).toBe('CODE_EXPIRED')
  })
})
