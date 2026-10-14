import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { AppError } from '../utils/AppError'
import { IMAGE_TYPES, MAX_IMAGE_BYTES, detectImageType, type ImageType } from '../services/imageStorage'

// Multer: file memory mein (disk / MongoDB / Cloudinary baad mein service tay karti hai).
// Sirf ek tasveer, 2 MB tak, jpg / png / webp
const multerImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, done) => {
    if (file.mimetype in IMAGE_TYPES) return done(null, true)
    done(new AppError(400, 'INVALID_IMAGE', 'Upload a JPG, PNG or WebP image', { photo: 'Upload a JPG, PNG or WebP image' }))
  },
}).single('photo')

declare module 'express-serve-static-core' {
  interface Request {
    // Asal file se pehchani hui qism (upload middleware ke baad)
    imageType?: ImageType
  }
}

// Form field "photo". File na ho, bari ho, ya asal mein tasveer na ho to saaf 400
export function uploadImage(req: Request, res: Response, next: NextFunction) {
  multerImage(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE' ? 'The image must be 2 MB or smaller' : 'Upload one image in the "photo" field'
      return next(new AppError(400, error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD', message, { photo: message }))
    }
    if (error) return next(error)
    if (!req.file) {
      return next(new AppError(400, 'NO_FILE', 'Choose an image to upload', { photo: 'Choose an image to upload' }))
    }
    const type = detectImageType(req.file.buffer)
    if (!type) {
      return next(new AppError(400, 'INVALID_IMAGE', 'Upload a JPG, PNG or WebP image', { photo: 'Upload a JPG, PNG or WebP image' }))
    }
    req.imageType = type
    next()
  })
}
