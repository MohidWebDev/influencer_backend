# Influence Platform: Backend

Node.js + Express + TypeScript + MongoDB (Mongoose). MVC style REST API, deployed on Vercel.

## Run locally

```bash
npm install
cp .env.example .env     # then put your MONGO_URI in .env
npm run dev
```

Check it works: open http://localhost:5000/api/health. You should see `{"success":true,"data":{"status":"ok"}}`.

## Folder structure

```
src/
├─ config/           env variables + MongoDB connection
├─ constants/        fixed lists (account roles)
├─ models/           Mongoose schemas (M)
├─ controllers/      request logic (C)
├─ routes/           URL -> controller mapping
├─ middlewares/      runs before controllers (db, auth, errors)
├─ services/         shared logic used by controllers and scripts (slugs, taxonomy lookups)
├─ seed/             seed data and scripts (taxonomy, demo people, make-admin)
├─ validators/       Zod schemas for request input
├─ types/            TypeScript types (req.user)
├─ utils/            helpers (response format, AppError, JWT, cookies)
├─ app.ts            Express app setup (Vercel uses this default export)
└─ server.ts         starts the server locally
```

## Seed data

Run these locally with `MONGO_URI` in `.env` pointing at the database you want to fill:

```bash
npm run seed              # professions, industries, topics (safe to run again)
npm run seed:demo         # taxonomy + 12 fictional sample people (isDemo: true)
npm run seed:clear-demo   # remove the sample people
npm run seed:real         # remove the sample people, add 30 real public profiles + Wikipedia photos
npm run seed:real -- --no-photos   # same, without downloading photos
npm run make-admin -- you@example.com   # make a registered user an admin
```

`seed:real` is safe to run again: people are upserted by slug, and `claimedBy` / `verified` are only set when a profile is first created, so an approved claim is never undone. Photos come from each person's English Wikipedia lead image. Only Wikimedia Commons files with a free license (CC0, CC BY, CC BY-SA, public domain, GFDL) (plus GODL-India) are used. Each one is resized to 600px wide WebP with `sharp`, and they are saved in the `personphotos` collection with the author and license in `photoCredit`. Anyone without a usable image gets the initials avatar. The script needs internet access to `en.wikipedia.org`, `commons.wikimedia.org` and `upload.wikimedia.org`. Each request is retried up to 4 times with a growing pause. If a download still fails, the person keeps their current photo and the script says to run it again.

## Request flow

```
Request -> app.ts -> routes -> middlewares -> controller -> model -> sendSuccess / sendError
```

## Response format

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 134 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": {} } }
```

## Auth endpoints

| Method | URL | Who | What |
|---|---|---|---|
| POST | `/api/auth/register` | anyone | body: `name, email, password, role` (talent / representative / business / agency / organization) |
| POST | `/api/auth/login` | anyone | body: `email, password` |
| POST | `/api/auth/refresh` | refresh cookie | new access + refresh tokens |
| POST | `/api/auth/logout` | anyone | clears cookies, invalidates refresh tokens |
| GET | `/api/auth/me` | logged in | current user |
| PATCH | `/api/auth/password` | logged in | body `currentPassword, newPassword` (min 8, must differ). Wrong current password: 400 `WRONG_PASSWORD`. Logs out other devices; this device gets new cookies |
| DELETE | `/api/auth/account` | logged in | body `confirm` = `delete <your name>` (case and extra spaces ignored), else 400 `CONFIRMATION_MISMATCH`. The last active admin cannot delete themselves (409 `LAST_ADMIN`). Owned profile goes back to unclaimed (and loses the verified badge); the user's claims, draft profiles and notifications are removed; audit action `user.self_delete` |
| POST | `/api/auth/forgot-password` | public | body `email`. Emails a 6-digit code (valid 10 min). Always answers `{ sent: true, resendIn: 60 }`, so it never reveals whether an email is registered. A new code is sent at most once every 60 s; suspended accounts get nothing |
| POST | `/api/auth/forgot-password/verify` | public | body `email, code`. Wrong code: 400 `INVALID_CODE` with `details.attemptsLeft`; after 5 wrong tries 429 `TOO_MANY_ATTEMPTS`; old code 400 `CODE_EXPIRED`. Success returns a one-time `resetToken` (valid 15 min); the code stops working |
| POST | `/api/auth/reset-password` | public | body `email, resetToken, newPassword` (min 8). Bad or expired token: 400 `RESET_EXPIRED`. Sets the password, logs out every other device, logs in on this one and emails a "password changed" notice |

Tokens live in httpOnly cookies: `accessToken` (15 min) and `refreshToken` (7 days, sent only to `/api/auth`).

Protect a route:

```ts
router.post('/inquiries', requireAuth, requireRole('business', 'agency'), createInquiry)
```

## People endpoints

| Method | URL | Who | What |
|---|---|---|---|
| GET | `/api/people` | anyone | search: `q, profession, industry, topic, country, city, language, minFollowers, status, openTo, match, page, limit, sort (followers / newest / name)`. `profession/industry/topic` take slugs and `country` takes 2-letter codes, all comma separated. Without `match`: any value inside one field, every field must match. `match=all` (Browse multi-select): the person must have every selected profession/industry/topic (countries stay "any of", a person has one country). `match=any`: the person matches at least one selected item of any field |
| GET | `/api/people/:slug` | anyone | public profile |

Public `GET /api/people` and `/api/people/:slug` are cached on the Vercel CDN for 10 s (stale-while-revalidate 20 s). A request with `?_fresh=<anything>` skips the CDN (`Cache-Control: no-store`); the frontend adds it for logged-in users so admins see changes instantly.

| GET | `/api/people/photos/:id` | anyone | profile photo stored in MongoDB (`photoUrl` points here). Cached for a year: a new photo gets a new id |
| GET | `/api/me/services` | talent with a claimed profile | `{ person, services, availability }` (all services, hidden ones too). No claimed profile: 404 `NO_PROFILE` |
| POST | `/api/me/services` | talent | body `title, category, description?, pricing, deliveryDays?, isActive?`. `pricing` is `{ type: 'fixed', currency, unit, amount }`, `{ type: 'range', currency, unit, min, max }` (max > min) or `{ type: 'quote' }`. Up to 12 services (409 `TOO_MANY_SERVICES`) |
| PATCH | `/api/me/services/:id` | talent | any of the fields above, e.g. `{ isActive: false }` to hide it from the public profile. `deliveryDays: null` clears it |
| DELETE | `/api/me/services/:id` | talent | remove a service |
| PUT | `/api/me/availability` | talent | body `isOpen, openTo[] (speaking, campaigns, podcasts, events), responseTime? (24h, 3d, 1w), availableFrom?, note?` |

Services and availability live on the talent's `Person`. The public profile only returns active services. A claimed profile becomes `hireable` automatically when it is open for work and has at least one active service, and goes back to `contactable` when it is not (`represented` is never changed). `GET /api/people?openTo=speaking` lists people who are open for that kind of work. Deleting the owner's account clears the services and availability.
| POST | `/api/people` | admin | create a profile (taxonomy as slugs). A new profile cannot be `verified` (409 `PROFILE_NOT_CLAIMED`) |
| PATCH | `/api/people/:id` | admin or the user who claimed it | edit; only admin can change `name, status, visibility`. On a claimed profile the admin can only change `visibility` (403 `PROFILE_CLAIMED` otherwise). `verified` cannot be changed by hand (409 `AUTO_VERIFIED`): a profile becomes verified automatically when its claim is approved |
| DELETE | `/api/people/:id` | admin | delete a profile permanently (prefer `visibility: hidden` for takedowns) |
| GET | `/api/taxonomy/professions` (`industries`, `topics`) | anyone | dropdown lists |

## Claim endpoints

A talent says "this profile is me". We verify it with a one-time code sent to one of their official accounts:

```
pending             talent sent a claim with official account links
waiting_for_talent  admin generated a 6-digit code (OTP) and sent it by DM to one of those links
otp_failed          talent entered a wrong code 5 times; the claim is locked until the admin acts
verified            identity confirmed: correct OTP (verificationMethod "otp") or by the admin ("admin_manual")
approved            admin gave final approval (person.claimedBy is set)
rejected            admin rejected, or another claim for the same profile was approved
```

Flow:

```
pending -> waiting_for_talent -> (correct OTP) verified -> (admin approves) approved
                    |  5 wrong codes
                    v
               otp_failed -> (admin: reset OTP) waiting_for_talent
                          -> (admin: verify manually) verified + approved
any open status -> (admin rejects) rejected
```

Claim fields for verification: `otpAttempts` (default 0), `otpLockedAt`, `lastOtpAttemptAt`, `verifiedAt`, `verifiedBy` (admin user id, `null` when the talent verified by OTP), `verificationMethod` (`otp` or `admin_manual`).

Old claims are migrated when the server connects to MongoDB (`migrateLegacyClaims()`, safe to run many times). On the same connect, `syncVerifiedWithClaims()` makes `verified` match ownership (claimed profiles are verified, unclaimed ones are not). Claim migration: `code_sent` becomes `waiting_for_talent`, `code_verified` becomes `verified`, and `verification.attempts` moves to `otpAttempts`.

| Method | URL | Who | What |
|---|---|---|---|
| POST | `/api/claims` | talent | body: `personId, links[] (min 1), note?`. The claim's `evidence.contactEmail` is always the claimant's login email (any `contactEmail` in the body is ignored). One open claim per user, one owned profile per user |
| POST | `/api/claims/new-profile` | talent | when the talent cannot find their profile. body: `name, socialAccounts[] (min 1), headline?, bio?, country?, city?, languages?, professions?, industries?, topics?, photoUrl?, websiteUrl?, note?, force?`. `evidence.contactEmail` is the claimant's login email. Creates a hidden draft profile (`isDraft`) plus a claim with `isNewProfile: true`; the social links become the claim links. If a visible profile has the same name or social link: 409 `POSSIBLE_DUPLICATE` with `error.details.matches` (send `force: true` to create anyway) |
| GET | `/api/claims/mine` | logged in | my claims, newest first |
| GET | `/api/claims/my-profile` | logged in | the Person I own, or `null` |
| POST | `/api/claims/:id/verify` | claim owner | body: `code`. Wrong code: 400 `INVALID_CODE` with `error.details.attemptsLeft`. 5th wrong code or any try after: 423 `OTP_LOCKED`. Code expires after 48h (410 `CODE_EXPIRED`) |
| GET | `/api/admin/claims?status=open` | admin | `open` (default), `needs_action` (pending, otp_failed, verified), `all`, or one status |
| POST | `/api/admin/claims/:id/code` | admin | from `pending` / `waiting_for_talent`. body: `channelUrl` (one of the claim links). Returns the code once |
| POST | `/api/admin/claims/:id/reset-otp` | admin | from `waiting_for_talent` / `otp_failed`. body: `channelUrl?` (default: the last link used). Resets attempts and lock, status back to `waiting_for_talent`, returns the new code once |
| POST | `/api/admin/claims/:id/verify-manual` | admin | from `waiting_for_talent` / `otp_failed`. Marks the claim verified (`admin_manual`, `verifiedBy`) and approves it |
| PATCH | `/api/admin/claims/:id` | admin | body: `action: approve / reject, reason?`. Approve only from `verified`; reject from any open status |

New profiles go through the same code flow. Approving publishes the draft (visible, owned by the talent); rejecting deletes the draft (the claim keeps `requestedName`). An admin cannot make a draft visible by hand (409 `PROFILE_PENDING_REVIEW`). `GET /api/admin/claims?status=new_profiles` lists open new-profile claims.

Error responses can carry extra data in `error.details`, for example `{ "attemptsLeft": 3, "maxAttempts": 5 }`.

Codes are stored as SHA-256 hashes (salted with the claim id) and compared in constant time. Generating a new code invalidates the old one and resets attempts. Approving sets `person.claimedBy` through `setPersonOwner()`, moves a `public` profile to `contactable`, and auto-rejects other open claims for the same profile.

## Business endpoints

A business account must be verified before it can hire, with the same one-time code flow as talent claims. Only verified talents (claimed profiles with the verified badge) can be hired.

```
pending               business sent its company details, the admin has to send a code
waiting_for_business  admin generated a 6-digit code and sent it to one of the business's contacts
otp_failed            business entered a wrong code 5 times; locked until the admin acts
code_verified         correct code entered; waiting for the admin's final approval
approved              verified business: can send hire requests to verified talents
rejected              admin rejected (rejectionReason); the business fixes the details and saves again -> pending
```

```
pending -> waiting_for_business -> (correct code) code_verified -> (admin approves) approved
                    |  5 wrong codes
                    v
               otp_failed -> (admin: reset OTP) waiting_for_business
                          -> (admin: verify manually) approved
any status -> (admin rejects) rejected
```

The code can be sent to the business's login email, website, any proof link or contact phone (`channels` in the admin detail response). Codes are stored as salted SHA-256 hashes, expire after 48 hours and are returned to the admin only once, exactly like claim codes. Fields: `verification { channel, codeSentAt, expiresAt }`, `otpAttempts`, `otpLockedAt`, `lastOtpAttemptAt`, `verifiedAt`, `verifiedBy` (`null` when the business entered the code), `verificationMethod` (`otp` / `admin_manual`).

| Method | URL | Who | What |
|---|---|---|---|
| GET | `/api/business/profile` | business | `{ business }` (company details + `status`), or `null` |
| PUT | `/api/business/profile` | business | body `companyName, websiteUrl, country (2 letters), industry?, companySize? (1-10, 11-50, 51-200, 201-1000, 1000+), description?, registrationNumber?, city?, contactPhone?, proofLinks[]? (max 5)`. First save creates it as `pending` (201). Small edits keep the current status. Changing `companyName, registrationNumber, websiteUrl` or `country`, or saving after a rejection, starts verification again from `pending` (an approved business loses hiring until it is verified again) |
| POST | `/api/business/profile/verify` | business | body `code`. Wrong code: 400 `INVALID_CODE` with `details.attemptsLeft`. 5th wrong code or any try after: 423 `OTP_LOCKED`. No code sent: 409 `NO_ACTIVE_CODE`. Expired: 410 `CODE_EXPIRED` |
| POST | `/api/business/hires` | approved business | body `personId, title, message (min 20), serviceId?, budget? { amount, currency }, startDate?`. Not approved: 403 `BUSINESS_NOT_VERIFIED`. Talent not verified / unclaimed: 403 `TALENT_NOT_VERIFIED`. One pending request per talent (409 `HIRE_PENDING`). `serviceId` must be one of the talent's active services |
| GET | `/api/business/hires` | business | my hire requests, newest first |
| POST | `/api/business/hires/:id/cancel` | business | cancel a `pending` request |
| GET | `/api/me/hire-requests` | talent | requests sent to me, with the business details |
| PATCH | `/api/me/hire-requests/:id` | talent | body `action: accept / decline, note?`. Only from `pending` |
| GET | `/api/admin/businesses?status=&q=&page=&limit=` | admin | `status`: one status, `open` or `needs_action` (pending, otp_failed, code_verified). Open ones oldest first |
| GET | `/api/admin/businesses/:id` | admin | `{ business, channels, history }` |
| POST | `/api/admin/businesses/:id/code` | admin | from `pending` / `waiting_for_business`. body `channel` (one of `channels`). Returns the code once |
| POST | `/api/admin/businesses/:id/reset-otp` | admin | from `waiting_for_business` / `otp_failed`. body `channel?` (default: the last one used). New code, attempts and lock reset |
| POST | `/api/admin/businesses/:id/verify-manual` | admin | from `waiting_for_business` / `otp_failed`. Verifies (`admin_manual`) and approves |
| PATCH | `/api/admin/businesses/:id` | admin | body `action: approve / reject, reason?`. Approve only from `code_verified` (409 `BUSINESS_CODE_NOT_VERIFIED`). Reject from any other status, including `approved` (takes away hiring) |

Hire statuses: `pending`, `accepted`, `declined`, `cancelled`. Notifications: admins get `business.new`, `business.code_verified`, `business.otp_locked`; the business gets `business.code_sent`, `business.approved`, `business.rejected`, `hire.accepted`, `hire.declined`; the talent gets `hire.new`, `hire.cancelled`. Audit actions: `business.send_code`, `business.reset_otp`, `business.otp_locked` (the business is the actor), `business.verify_manual`, `business.approve`, `business.reject`. Deleting an account removes its business details and its hire requests.

## Notification endpoints (logged in)

Notifications are stored per user in the `notifications` collection: `type`, `data` (names used to build the sentence on the frontend), `link` (page to open), `readAt`.

| Method | URL | What |
|---|---|---|
| GET | `/api/notifications?page=&limit=&unread=true` | my notifications, newest first; `data.unread` = unread count |
| GET | `/api/notifications/unread-count` | `{ unread }` for the bell badge |
| PATCH | `/api/notifications/:id/read` | mark one as read (only your own) |
| POST | `/api/notifications/read-all` | mark all as read |

Sent automatically:

- every active admin: `claim.new`, `claim.new_profile`, `claim.code_verified`, `claim.otp_locked` (link `/admin/claims/:id`), `report.new` (link `/admin/reports/:id`)
- the talent: `claim.code_sent`, `claim.approved`, `claim.rejected` (link `/dashboard`)

A failed notification never fails the action that triggered it.

## Admin endpoints (admin only)

| Method | URL | What |
|---|---|---|
| GET | `/api/admin/people?q=&visibility=&page=&limit=` | all profiles, including hidden |
| GET | `/api/admin/people/:id` | one profile by id (for the edit form) |

Create and edit use `POST /api/people` and `PATCH /api/people/:id`.

## Caching

Public GETs send `Cache-Control: public, max-age=0, must-revalidate` (the browser always checks) and `CDN-Cache-Control` so Vercel's CDN can answer for 60s (people) or 1h (taxonomy). Errors are `no-store`.

## Environment variables on Vercel

`NODE_ENV`, `CLIENT_URL`, `MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (see `.env.example`).

For password reset emails also set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`. With Gmail use `smtp.gmail.com`, port `587` and a Google **App Password** (not the normal Gmail password). Without `SMTP_HOST` the code is printed in the server terminal in development, and production answers 503 `EMAIL_NOT_CONFIGURED`.

## Admin panel API (admin only)

Every route below uses `requireAuth` + `requireRole('admin')`.

| Method | URL | What |
|---|---|---|
| GET | `/api/admin/stats` | counts for people, users, claims, reports and businesses (`needsAction`, `approved`) |
| GET | `/api/admin/claims/:id` | one claim with person, claimant, evidence and audit history |
| GET | `/api/admin/users?q=&role=&status=&page=&limit=` | users list |
| PATCH | `/api/admin/users/:id/status` | body `status: active / suspended`. Not yourself; one active admin must remain |
| PATCH | `/api/admin/users/:id/role` | body `role`. Same rules. Logs the user out (refresh tokens invalidated) |
| GET | `/api/admin/reports?status=&reason=&page=&limit=` | reports queue (open first, oldest first) |
| GET | `/api/admin/reports/:id` | report detail with audit history |
| PATCH | `/api/admin/reports/:id` | body `status: reviewing / resolved / rejected, adminNote?, hidePerson?` |
| GET | `/api/admin/audit-logs?action=&targetType=&targetId=&actor=&from=&to=&page=&limit=` | read-only audit log; `action` matches a prefix (`claim` finds `claim.approve`) |

Public: `POST /api/reports` with `personId, reason, details, reporterName?, reporterEmail?` (email required for guests).

### Audit log

Every admin action (and an OTP lock) is stored in the `audit_logs` collection: actor, action, target, before/after snapshot, IP and time. Actions: `person.create`, `person.update`, `person.delete`, `person.hide`, `claim.send_code`, `claim.reset_otp`, `claim.verify_manual`, `claim.otp_locked` and `claim.new_profile` (written with the talent as the actor), `claim.approve`, `claim.reject`, `business.send_code`, `business.reset_otp`, `business.otp_locked`, `business.verify_manual`, `business.approve`, `business.reject`, `user.suspend`, `user.unsuspend`, `user.role_change`, `report.update`. Passwords, token versions and claim codes are never stored.

## Tests

```bash
npm test
```

Jest + Supertest with an in-memory MongoDB (`mongodb-memory-server` downloads a MongoDB binary the first time). Each test file uses its own database.

## Author

Built and maintained by [Hammad Toufeeq](https://github.com/hammadtoufeeq).
