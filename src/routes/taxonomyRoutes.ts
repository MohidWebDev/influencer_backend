import { Router } from 'express'
import { listTaxonomy } from '../controllers/taxonomyController'
import { cachePublic } from '../middlewares/cachePublic'

const router = Router()

router.get('/:type', cachePublic(3600), listTaxonomy)

export default router
