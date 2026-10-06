import type { Request, Response } from 'express'
import { Industry, Profession, Topic } from '../models/taxonomy'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'

const MODELS = {
  professions: Profession,
  industries: Industry,
  topics: Topic,
}

// GET /api/taxonomy/:type -> dropdowns ke liye list
export async function listTaxonomy(req: Request, res: Response) {
  const type = req.params.type as keyof typeof MODELS
  const TaxonomyModel = MODELS[type]
  if (!TaxonomyModel) {
    throw new AppError(404, 'NOT_FOUND', 'Use professions, industries or topics')
  }

  const items = await TaxonomyModel.find().sort({ order: 1, name: 1 })
  sendSuccess(res, { items })
}
