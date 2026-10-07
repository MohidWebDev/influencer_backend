// Apni marzi ka error jisme HTTP status aur error code bhi ho
export class AppError extends Error {
  statusCode: number
  code: string
  fields?: Record<string, string>
  // Extra maloomat, jaise { attemptsLeft: 3 }
  details?: Record<string, unknown>

  constructor(
    statusCode: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.fields = fields
    this.details = details
  }
}
