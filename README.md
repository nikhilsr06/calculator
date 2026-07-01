# formula-calc


Full implementation of the spec: a black-box calculation engine where employees
get inputs → results only, and administrators manage formulas through a secure
backend that never exposes formula expressions to the client.

```
formula-calc-2/
├── server/      Express + TypeScript API (formula engine, auth, RBAC, DB)
└── frontend/    React + TypeScript + Tailwind + Tauri desktop app
```

## 1. Set up the database (Supabase)

1. In your Supabase project, go to **Project Settings → Database → Connection string (URI)**
   and copy it.
2. Copy `server/.env.example` to `server/.env` and fill in:
   - `DATABASE_URL` — the Supabase connection string
   - `DATABASE_SSL=true`
   - `JWT_SECRET` — generate a long random string (e.g. `openssl rand -hex 32`)
3. Run the migration, which creates all tables from spec section 7:
   ```bash
   cd server
   npm install
   npm run migrate
   ```

## 2. Create your first administrator account

There's no public registration endpoint by design (spec: only authorized
administrators may manage formulas). Create one directly:

```bash
cd server
npx tsx src/db/seedAdmin.ts admin@yourcompany.com "YourStrongPassword123!"
```

## 3. Run the backend

```bash
cd server
npm run dev
```

The API listens on `http://localhost:4000` (configurable via `PORT` in `.env`).

## 4. Run the frontend (desktop app)

```bash
cd frontend
npm install
npm run dev          # browser dev mode, http://localhost:1420
# or, for the actual desktop shell:
npm run tauri dev    # requires Rust + Tauri CLI prerequisites installed
```

Set `frontend/.env` with `VITE_API_URL=http://localhost:4000` if your backend
runs somewhere other than localhost.

## How the black-box model is enforced

- The formula `expression` column is **only ever selected** by admin routes
  (`server/src/routes/admin.ts`). Employee routes (`server/src/routes/calculators.ts`)
  never select it, and `/api/calculate` evaluates it server-side and returns only
  the numeric result.
- Formula evaluation uses mathjs's restricted expression parser
  (`server/src/services/formulaEngine.ts`) — **no `eval()`**, no access to Node
  globals, and assignment/function-definition syntax is rejected so a malicious
  formula can't redefine behavior.
- RBAC is enforced exclusively server-side (`requireRole("administrator")` on every
  admin route). The frontend's route guards are UX-only, matching the spec's
  requirement that "frontend restrictions shall not be considered sufficient
  security measures."
- Every administrative action (create/update/delete/publish/disable calculators
  and formulas) writes to `audit_logs`. Every calculation writes to
  `calculation_logs`.
- Formula versioning: a partial unique index guarantees only one active version
  per calculator at the database level, not just in application code.

## Deploying

Per spec section 10, the initial deployment target is:

```
Desktop App → Render (backend) → Supabase Postgres
```

To deploy the backend to Render: build with `npm run build`, start with
`npm run start`, and set the same environment variables as `.env.example`.
No code changes are needed to later migrate to an internal server with local
Postgres — only `DATABASE_URL`/`DATABASE_SSL` change.
