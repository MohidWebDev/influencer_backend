# uploads

Profile photos and logos uploaded by users (talent, managers, businesses, admins) are saved here
when the backend runs on a normal server or locally (`UPLOAD_DRIVER=disk`, the default outside Vercel).

- Files are named `<id>.<ext>` and served at `/api/uploads/<id>.<ext>`.
- Uploaded files are user data, so they are **not** committed (see `.gitignore`); only this folder is.
- On Vercel the file system is read-only, so uploads go to MongoDB instead (`UPLOAD_DRIVER=mongo`, the
  default when `VERCEL` is set). Cloudinary can be added later as another driver in
  `src/services/imageStorage.ts` without changing the routes or the frontend.
