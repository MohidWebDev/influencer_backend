// Asal SMTP server nahi: nodemailer ko mock karte hain
const sendMail = jest.fn()
const createTransport = jest.fn(() => ({ sendMail }))
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport } }))

const message = { to: 'ali@example.com', subject: 'Your code', text: '123456', html: '<p>123456</p>' }
const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']

async function loadMail(env: Record<string, string>) {
  jest.resetModules()
  Object.assign(process.env, env)
  return import('../src/services/mailService')
}

afterEach(() => {
  sendMail.mockReset()
  createTransport.mockClear()
  for (const key of SMTP_KEYS) delete process.env[key]
})

describe('mailService (SMTP / nodemailer)', () => {
  it('sends through the SMTP server with MAIL_FROM', async () => {
    sendMail.mockResolvedValue({ messageId: '1' })
    const mail = await loadMail({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'bot@example.com',
      SMTP_PASS: 'secret',
      MAIL_FROM: 'Influence <hi@example.com>',
    })
    await mail.sendMail(message)
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'bot@example.com', pass: 'secret' },
    })
    expect(sendMail).toHaveBeenCalledWith({ from: 'Influence <hi@example.com>', ...message })
  })

  it('answers 503 EMAIL_FAILED when the SMTP server refuses', async () => {
    sendMail.mockRejectedValue(new Error('535 auth failed'))
    const mail = await loadMail({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'bot@example.com' })
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(mail.sendMail(message)).rejects.toMatchObject({ statusCode: 503, code: 'EMAIL_FAILED' })
    log.mockRestore()
  })

  it('prints the email in development when SMTP is not set up', async () => {
    const mail = await loadMail({})
    const log = jest.spyOn(console, 'info').mockImplementation(() => {})
    await mail.sendMail(message)
    expect(createTransport).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
