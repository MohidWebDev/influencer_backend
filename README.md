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
npm run make-admin -- you@example.com   # make a registered user an admin
```

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

Tokens live in httpOnly cookies: `accessToken` (15 min) and `refreshToken` (7 days, sent only to `/api/auth`).

Protect a route:

```ts
router.post('/inquiries', requireAuth, requireRole('business', 'agency'), createInquiry)
```

## People endpoints

| Method | URL | Who | What |
|---|---|---|---|
| GET | `/api/people` | anyone | search: `q, profession, industry, topic, country, city, language, minFollowers, status, page, limit, sort (followers / newest / name)`. `profession/industry/topic` take slugs, comma separated |
| GET | `/api/people/:slug` | anyone | public profile |
| POST | `/api/people` | admin | create a profile (taxonomy as slugs) |
| PATCH | `/api/people/:id` | admin or the user who claimed it | edit; only admin can change `name, status, verified, visibility`. On a claimed profile the admin can only change `verified` and `visibility` (403 `PROFILE_CLAIMED` otherwise) |
| DELETE | `/api/people/:id` | admin | delete a profile permanently (prefer `visibility: hidden` for takedowns) |
| GET | `/api/taxonomy/professions` (`industries`, `topics`) | anyone | dropdown lists |

## Claim endpoints

A talent says "this profile is me". We verify it with a one-time code sent to one of their official accounts:

```
pending        talent sent a claim with official account links
code_sent      admin generated a 6-digit code and sent it by DM to one of those links
code_verified  talent entered the correct code on the website
approved       admin gave final approval (person.claimedBy is set)
rejected       admin rejected, or another claim for the same profile was approved
```

| Method | URL | Who | What |
|---|---|---|---|
| POST | `/api/claims` | talent | body: `personId, links[] (min 1), contactEmail?, note?`. One open claim per user, one owned profile per user |
| GET | `/api/claims/mine` | logged in | my claims, newest first |
| GET | `/api/claims/my-profile` | logged in | the Person I own, or `null` |
| POST | `/api/claims/:id/verify` | claim owner | body: `code`. 5 attempts, code expires after 48h |
| GET | `/api/admin/claims?status=open` | admin | `open`, `needs_action`, or one status |
| POST | `/api/admin/claims/:id/code` | admin | body: `channelUrl` (one of the claim links). Returns the code once |
| PATCH | `/api/admin/claims/:id` | admin | body: `action: approve / reject, reason?`. Approve only after `code_verified` |

Codes are stored as SHA-256 hashes (salted with the claim id) and compared in constant time. Generating a new code invalidates the old one and resets attempts. Approving sets `person.claimedBy` through `setPersonOwner()`, moves a `public` profile to `contactable`, and auto-rejects other open claims for the same profile.

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
