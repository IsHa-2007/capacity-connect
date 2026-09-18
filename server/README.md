# CAPACITY CONNECT — Backend (REST API)

Production-oriented **Node.js + Express** backend foundation for CAPACITY CONNECT.
It is the business-logic layer between the React frontend and Supabase
(Auth, PostgreSQL, Storage).

> **Status:** Foundation only (Module 4). Database schema, data migration,
> Cloudinary migration, and full feature implementations are NOT included yet.

---

## Directory Structure

```
server/
├── src/
│   ├── config/
│   │   └── env.js            Environment validation (fails fast on missing config)
│   ├── lib/
│   │   ├── supabase.js       Public/client-safe Supabase client (ANON key)
│   │   └── supabaseAdmin.js  Server-only Supabase client (SERVICE-ROLE key)
│   ├── middleware/
│   │   ├── authenticate.js      Bearer token → req.user (Supabase Auth)
│   │   ├── authorize.js         authorize(...roles) + requireApprovedUser
│   │   ├── validate.js          Zod schema request validation
│   │   ├── notFound.js          404 handler
│   │   └── errorHandler.js      Centralized error responses
│   ├── repositories/
│   │   └── user.repository.js   public.users access (single place for queries)
│   ├── routes/
│   │   ├── index.js             Mounts namespaces under /api
│   │   ├── health.routes.js     GET /api/health
│   │   └── auth.routes.js       /api/auth/register|login|logout|me
│   ├── controllers/
│   │   └── auth.controller.js
│   ├── services/
│   │   ├── auth.service.js      Supabase Auth operations
│   │   └── storage.service.js   Storage abstraction (no files migrated)
│   ├── validators/
│   │   └── auth.validator.js    Zod schemas
│   ├── utils/
│   │   └── apiResponse.js       ApiError + success/error response helpers
│   ├── app.js                   Express app factory
│   └── server.js                HTTP entry point
├── .env.example
└── package.json
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | yes | Public/client-safe key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server-only** privileged key |
| `CLIENT_ORIGIN` | yes* | Allowed browser origin for CORS (default `http://localhost:5173`) |
| `PORT` | no | HTTP port (default `5000`) |
| `NODE_ENV` | no | `development` \| `test` \| `production` (default `development`) |

\* `CLIENT_ORIGIN` has a default; set it explicitly for production.

The server **fails at startup** if required environment values are missing.
Copy `server/.env.example` → `server/.env` and fill real values. `server/.env`
is git-ignored and must never be committed.

## Run Locally

```bash
cd server
npm install
npm run dev        # node --watch (auto restart)
# or
npm start          # single run
```

Health check:

```
GET http://localhost:5000/api/health
```

```json
{
  "success": true,
  "message": "Capacity Connect API is running",
  "data": { "service": "capacity-connect-api", "status": "ok", "timestamp": "..." }
}
```

Root-level convenience scripts (from the repository root):

```bash
npm run server       # start backend
npm run server:dev   # start backend with auto-restart
```

## API Base URL

All endpoints are mounted under `/api`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Service health |
| POST | `/api/auth/register` | — | Register (creates auth user + profile) |
| POST | `/api/auth/login` | — | Login, returns tokens + profile |
| POST | `/api/auth/logout` | Bearer | Revoke access token |
| GET | `/api/auth/me` | Bearer | Current user + profile |

## Authentication Model

1. Client authenticates with Supabase Auth and obtains an access token.
2. Client sends `Authorization: Bearer <token>`.
3. `authenticate` middleware validates the token server-side (signature verified
   by Supabase GoTrue), then attaches `req.user = { id, email, phone }`.
4. Anything from the client is never trusted: no user-ID in the body, no
   client-supplied role, no client-supplied approval status.

Roles (`ADMIN`, `TRAINER`, `TRAINEE`) and approval status
(`PENDING`, `APPROVED`, `REJECTED`) are read from `public.users`, never from the
request.

Usage:

```js
// require any of these roles (applies authenticate implicitly? no — compose):
router.get('/x', authenticate, authorize('ADMIN', 'TRAINER'), handler)
// additionally require an approved account:
router.get('/y', authenticate, authorize('TRAINEE'), requireApprovedUser, handler)
```

## Service-Role Security Rule

- `SUPABASE_SERVICE_ROLE_KEY` is used **only** by `server/src/lib/supabaseAdmin.js`.
- It must never:
  - appear in any API response
  - be prefixed with `VITE_`
  - be sent to the browser
  - be committed to Git
- The `supabase` (anon) client is the only client that may back user-scoped flows.

## Storage

`services/storage.service.js` defines the server-side interface:
`upload`, `createSignedUrl`, and `remove` against the **private**
`capacity-connect` bucket. If the bucket does not exist the service fails with a
clear error — it never auto-creates a public bucket and never returns permanent
public URLs.

**No files were migrated in Module 4.** The Cloudinary → Supabase Storage
migration is a separate future module.

## Database

The backend is written against the frozen Module 2/3 names (`public.users`,
snake_case columns). **No tables were created or modified in Module 4** — the
PostgreSQL schema is applied by a later, controlled SQL migration module.

## Not Implemented in Module 4

- Firebase → Supabase data / Auth migration
- Cloudinary → Supabase Storage file migration
- PostgreSQL schema creation
- Full feature routes (`/users`, `/courses`, `/enrollments`, `/assessments`,
  `/certificates`, `/broadcasts`, `/notifications`, `/competency`, `/storage`, ...)
- Frontend migration away from Firebase (the React app still runs on Firebase)

## Notes

If login/register return `503 PROFILE_*_UNAVAILABLE`, that is the expected
response while the `public.users` table does not exist yet — create the schema
in the next database module, or run locally exactly as documented above with a
provisioned Supabase project matching the frozen schema.