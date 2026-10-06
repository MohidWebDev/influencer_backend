import { Router } from 'express'
import { listTaxonomy } from '../controllers/taxonomyController'

const router = Router()

router.get('/:type', listTaxonomy)

export default router
