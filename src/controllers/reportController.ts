import type { Request, Response } from 'express'
import '../types/express'
import { Report } from '../models/Report'
import { Person } from '../models/Person'
import { notifyAdmins } from '../services/notificationService'
import { personExists } from '../services/personModerationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import type { CreateReportInput } from '../validators/reportValidator'

// POST /api/reports -> koi bhi profile ke baare mein galti ya removal report kare
export async function createReport(req: Request, res: Response) {
  const input = req.body as CreateReportInput

  if (!(await personExists(input.personId))) {
    throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  }
  // Guest ko email dena zaroori hai taake hum jawab de sakein
  if (!req.user && !input.reporterEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', {
      reporterEmail: 'Enter your email so we can follow up',
    })
  }

  const report = await Report.create({
    person: input.personId,
    reason: input.reason,
    details: input.details,
    reporter: req.user?.id,
    reporterName: input.reporterName || undefined,
    reporterEmail: input.reporterEmail || undefined,
  })

  const person = await Person.findById(input.personId).select('name')
  await notifyAdmins({
    type: 'report.new',
    data: { person: person?.name, reason: input.reason },
    link: `/admin/reports/${String(report._id)}`,
  })

  sendSuccess(res, { report: { _id: report._id, status: report.status } }, 201)
}
