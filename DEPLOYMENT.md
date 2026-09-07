# iSched — Vercel Deployment Guide

Step-by-step for deploying the iSched Next.js 16 app to Vercel with a Supabase
Postgres database and Supabase Auth.

---

## 0. Prerequisites

- A [Vercel](https://vercel.com) account (free Hobby plan is fine for the defense).
- A [Supabase](https://supabase.com) project (free tier is fine) — this provides
  **both** the Postgres database and Auth.
- The repo pushed to GitHub / GitLab / Bitbucket. Vercel deploys from a Git remote.
- Local `.env` values on hand — you will re-enter them in the Vercel dashboard.

---

## 1. Prepare the production Supabase project

1. Go to **supabase.com → New project**. Pick a region close to Lucban
   (e.g. `Southeast Asia (Singapore)`). Save the database password.
2. **Project Settings → API** — copy these three values:
   | Value | Vercel env var |
   |---|---|
   | Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
   | `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |
3. **Project Settings → Database → Connection string → "Connection pooling"**:
   - Copy the **Transaction** pooler URI (host ends in `...pooler.supabase.com`,
     port **6543**).
   - Append `?pgbouncer=true&connection_limit=1` to it.
   - This is your `DATABASE_URL`. **Use the pooler, not the direct `:5432`
     string** — Vercel runs serverless functions and the direct connection will
     exhaust Postgres connections.

   Example:
   ```
   postgresql://postgres.abcdxyz:YOURPASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   ```

---

## 2. Push the schema to the production database

The repo has **no `prisma/migrations` folder** — it syncs with `db push`. Do this
once against the production DB from your local machine:

```bash
# Temporarily point local Prisma at the PRODUCTION direct connection (port 5432,
# NOT the pooler) — db push needs a direct connection.
DATABASE_URL="postgresql://postgres.abcdxyz:YOURPASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" npx prisma db push
```

Then seed baseline data (colleges, departments, subjects, an initial
SUPER_ADMIN, etc.) against the same URL:

```bash
DATABASE_URL="<prod direct url>" npx tsx --env-file=.env prisma/seed.ts
```

> Run seed scripts you actually need (`prisma/seed-subjects.ts`, etc.). Verify in
> the Supabase Table Editor that tables and rows exist before moving on.

---

## 3. Import the project into Vercel

1. **vercel.com → Add New… → Project → Import** your Git repository.
2. Framework preset: **Next.js** (auto-detected).
3. Root directory: `./` (leave as-is).
4. Build & Output settings — leave defaults. The repo already does the right
   thing:
   - Build command: `next build` (Vercel default). `package.json` also runs
     `prisma generate` via `postinstall` **and** the `build` script, so the
     Prisma client is generated on Vercel even though `prisma/generated/` is
     gitignored.
   - Install command: `npm install` (default).
5. **Do not click Deploy yet** — add environment variables first (next step).

---

## 4. Configure environment variables in Vercel

**Project → Settings → Environment Variables.** Add each of these for the
**Production**, **Preview**, and **Development** environments (tick all three
unless noted):

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase **pooler** URI + `?pgbouncer=true&connection_limit=1` | From step 1.3 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` key | |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key | **Server-only. Never prefix with `NEXT_PUBLIC_`.** |
| `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app` | Set after first deploy gives you the domain, then redeploy. Update again if you attach a custom domain. |

> `.env` is gitignored and is **not** uploaded — Vercel only uses what you enter
> here.

---

## 5. First deploy

1. Click **Deploy**.
2. Wait for the build. If it fails, open the build log — most common causes:
   - `DATABASE_URL` missing or pointing at `localhost` → Prisma/build errors.
   - Using the direct `:5432` string instead of the pooler → runtime
     `too many connections` / timeouts once traffic hits.
   - Type or lint errors that don't show locally.
3. On success you get `https://<your-project>.vercel.app`.
4. Go back to **step 4**, set `NEXT_PUBLIC_APP_URL` to that URL, and
   **redeploy** (Deployments → ⋯ → Redeploy) so the value is baked in.

---

## 6. Point Supabase Auth at the Vercel domain

**Supabase → Authentication → URL Configuration:**

1. **Site URL**: `https://<your-project>.vercel.app`
2. **Redirect URLs** — add:
   - `https://<your-project>.vercel.app/**`
   - `https://*-<your-team>.vercel.app/**` (optional — lets preview deploys log in)
   - keep `http://localhost:3000/**` for local dev

**For Google OAuth** (chairs sign in with Google):

3. **Supabase → Authentication → Providers → Google** — ensure it's enabled with
   your Google client ID/secret.
4. In the **Google Cloud Console → APIs & Services → Credentials → your OAuth
   client → Authorized redirect URIs**, confirm
   `https://<project-ref>.supabase.co/auth/v1/callback` is listed. (This is the
   Supabase callback, not the Vercel one — it usually doesn't need changing.)

---

## 7. Smoke test the production deployment

- [ ] Visit `https://<your-project>.vercel.app` — landing/login page loads.
- [ ] Log in as a SUPER_ADMIN (CAS Department Head) with password.
- [ ] Log in with Google OAuth — redirects back to the app, session persists.
- [ ] Dashboard loads data (colleges, departments) — confirms `DATABASE_URL`
      works from serverless.
- [ ] Create a faculty record — confirms `SUPABASE_SERVICE_ROLE_KEY` works
      (`lib/supabase/admin.ts`).
- [ ] Run a schedule generation on a draft — confirms the backtracking engine
      runs within the function time limit.
- [ ] Export an ISO "Schedule of Subjects" / "Teaching Load" PDF.

> **Function timeout:** schedule generation is CPU-heavy. Hobby plan caps
> serverless functions at ~10s (Pro: 60s, configurable up to 300s). If
> generation times out, upgrade to Pro and add to `next.config.ts` route
> config, or set `maxDuration` on `/api/schedules/[id]/generate`:
> ```ts
> export const maxDuration = 60; // seconds (Pro plan)
> ```

---

## 8. Ongoing deploys

- **Every push to the default branch → automatic Production deploy.**
- **Every push to another branch / PR → automatic Preview deploy** with its own
  URL (shares the same env vars if you ticked "Preview").
- **Schema changes:** re-run `npx prisma db push` against the production direct
  URL (step 2) **before or with** the deploy that needs it. There is no
  migration step in the Vercel build — the build only runs `prisma generate`.
- **Rollback:** Deployments tab → pick a previous good deployment → **Promote to
  Production**.

---

## Quick reference — required env vars

```
DATABASE_URL=                 # Supabase TRANSACTION pooler URI + ?pgbouncer=true&connection_limit=1
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server-only
NEXT_PUBLIC_APP_URL=          # https://<your-project>.vercel.app
```
