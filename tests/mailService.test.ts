// Resend ka asal API nahi: SDK ko mock karte hain
const send = jest.fn()
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send } })) }))

const message = { to: 'ali@example.com', subject: 'Your code', text: '123456', html: '<p>123456</p>' }

async function loadMail(env: Record<string, string>) {
  jest.resetModules()
  Object.assign(process.env, env)
  return import('../src/services/mailService')
}

afterEach(() => {
  send.mockReset()
  delete process.env.RESEND_API_KEY
  delete process.env.MAIL_FROM
})

describe('mailService (Resend)', () => {
  it('sends through Resend with MAIL_FROM', async () => {
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null })
    const { sendMail } = await loadMail({ RESEND_API_KEY: 're_test', MAIL_FROM: 'Influence <hi@example.com>' })
    await sendMail(message)
    expect(send).toHaveBeenCalledWith({ from: 'Influence <hi@example.com>', ...message })
  })

  it('answers 503 EMAIL_FAILED when Resend returns an error or the network fails', async () => {
    const { sendMail } = await loadMail({ RESEND_API_KEY: 're_test' })
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'bad from' } })
    await expect(sendMail(message)).rejects.toMatchObject({ statusCode: 503, code: 'EMAIL_FAILED' })
    send.mockRejectedValue(new Error('offline'))
    await expect(sendMail(message)).rejects.toMatchObject({ statusCode: 503, code: 'EMAIL_FAILED' })
  })

  it('uses Resend’s test sender without MAIL_FROM, and prints the email without an API key', async () => {
    send.mockResolvedValue({ data: { id: 'email_2' }, error: null })
    const withKey = await loadMail({ RESEND_API_KEY: 're_test' })
    await withKey.sendMail(message)
    expect(send.mock.calls[0][0].from).toMatch(/<onboarding@resend\.dev>$/)

    delete process.env.RESEND_API_KEY
    const noKey = await loadMail({})
    const log = jest.spyOn(console, 'info').mockImplementation(() => {})
    await noKey.sendMail(message)
    expect(send).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
