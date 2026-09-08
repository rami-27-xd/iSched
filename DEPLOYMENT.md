# iSched — Vercel Deployment Guide

Step-by-step for deploying the iSched Next.js 16 app to Vercel with a Supabase
Postgres database and Supabase Auth.

**This project's specifics**

| Thing | Value |
|---|---|
| GitHub repo | `github.com/rami-27-xd/iSched` (branch `main`) |
| Vercel account | `vercel.com/rami-27-xd` |
| Supabase project ref | `qqxxjhojadmzyvpdyjvc` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qqxxjhojadmzyvpdyjvc.supabase.co` |
| Google OAuth callback | `https://qqxxjhojadmzyvpdyjvc.supabase.co/auth/v1/callback` |

---

## 0. Prerequisites

- The [Vercel](https://vercel.com/rami-27-xd) account (free Hobby plan is fine for
  the defense).
- The [Supabase](https://supabase.com/dashboard/project/qqxxjhojadmzyvpdyjvc)
  project — this provides **both** the Postgres database and Auth.
- Code pushed to `github.com/rami-27-xd/iSched` (already done).
- The Supabase **database password** on hand (set when the project was created;
  reset it under Settings → Database if unknown).

---

## 1. Collect the Supabase values

1. **Settings → API** (`/settings/api-keys`) — copy:
   | Value | Goes into env var | Notes |
   |---|---|---|
   | Project URL | `NEXT_PUBLIC_SUPABASE_URL` | `https://qqxxjhojadmzyvpdyjvc.supabase.co` |
   | `anon` / `publishable` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the public client key |
   | `service_role` / `secret` key | `SUPABASE_SERVICE_ROLE_KEY` | **server-only, never `NEXT_PUBLIC_`** |

   > The new dashboard shows "publishable" + "secret" keys; a "Legacy API keys"
   > tab shows the classic `anon` + `service_role` JWTs. Either pair works with
   > this codebase — publishable ↔ anon, secret ↔ service_role.
2. Connection strings (project region is **ap-south-1** / Mumbai):
   - **`DATABASE_URL` for Vercel** — the **Transaction pooler**, port **6543**:
     ```
     postgresql://postgres.qqxxjhojadmzyvpdyjvc:<YOUR_DB_PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
     ```
   - **For `prisma db push` (step 2 only)** — the **Session pooler**, port
     **5432**:
     ```
     postgresql://postgres.qqxxjhojadmzyvpdyjvc:<YOUR_DB_PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
     ```
   - Percent-encode any special characters in your password before using it in the URL (`!` → `%21`, `@` → `%40`, etc.)
     (`!`→`%21`, `@`→`%40`) — required or the URL parser breaks.
   - If the pooler host is rejected, open the Supabase **Connect** dialog and
     copy the exact host (it may be `aws-1-ap-south-1...`).
   - **Do not** use the direct `db.qqxxjhojadmzyvpdyjvc.supabase.co:5432` string
     for Vercel — serverless functions would exhaust Postgres connections.

---

## 2. Push the schema to the production database

The repo has **no `prisma/migrations` folder** — it syncs with `db push`. Do this
once against the production DB from your local machine:

Run in **PowerShell** from `C:\iSched` (cmd mangles `%` and doesn't support
`VAR=value cmd`):

```powershell
$env:DATABASE_URL = "postgresql://postgres.qqxxjhojadmzyvpdyjvc:<YOUR_DB_PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
npx prisma db push
```

Then seed baseline data (colleges, departments, subjects, an initial
SUPER_ADMIN, etc.) — the env var is still set in the same PowerShell window:

```powershell
npx tsx prisma/seed.ts
```

When done, close the window (or `Remove-Item Env:DATABASE_URL`) so your local
`.env` value is used again.

> Run seed scripts you actually need (`prisma/seed-subjects.ts`, etc.). Verify in
> the Supabase Table Editor that tables and rows exist before moving on.

---

## 3. Import the project into Vercel

1. **[vercel.com/rami-27-xd](https://vercel.com/rami-27-xd) → Add New… → Project
   → Import** `rami-27-xd/iSched`.
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

On the import screen, open **Environment Variables → "paste the .env contents"**
and paste this block, then fill in the one missing value:

```
DATABASE_URL=postgresql://postgres.qqxxjhojadmzyvpdyjvc:<YOUR_DB_PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
NEXT_PUBLIC_SUPABASE_URL=https://qqxxjhojadmzyvpdyjvc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_hbV_6CUrnuw6EWjf7NQo_w_6r_HC1gM
SUPABASE_SERVICE_ROLE_KEY=PASTE_SECRET_KEY_HERE
NEXT_PUBLIC_APP_URL=https://i-sched.vercel.app
```

| Name | Status | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ ready | Transaction pooler, port 6543, password encoded |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ ready | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ ready | publishable key (the legacy `anon` JWT also works) |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ **you paste it** | Supabase → Settings → API → **secret** / `service_role` key. Cannot be fetched programmatically. **Server-only — never `NEXT_PUBLIC_`.** |
| `NEXT_PUBLIC_APP_URL` | ⏳ fix after deploy | If the deployed domain isn't `i-sched.vercel.app`, update this in Settings and redeploy |

> Leave the "Environments" selector on **Production and Preview**.
> `.env` is gitignored and is **not** uploaded — Vercel only uses what you paste
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

**[Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/qqxxjhojadmzyvpdyjvc/auth/url-configuration):**

1. **Site URL**: `https://<your-project>.vercel.app`
2. **Redirect URLs** — add:
   - `https://<your-project>.vercel.app/**`
   - `https://*-rami-27-xd.vercel.app/**` (optional — lets preview deploys log in)
   - keep `http://localhost:3000/**` for local dev

**For Google OAuth** (chairs sign in with Google):

3. **Supabase → Authentication → Providers → Google** — ensure it's enabled with
   your Google client ID/secret.
4. In the **Google Cloud Console → APIs & Services → Credentials → your OAuth
   client → Authorized redirect URIs**, confirm
   `https://qqxxjhojadmzyvpdyjvc.supabase.co/auth/v1/callback` is listed. (This
   is the Supabase callback, not the Vercel one — it usually doesn't need
   changing.)

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
DATABASE_URL=postgresql://postgres.qqxxjhojadmzyvpdyjvc:<YOUR_DB_PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
NEXT_PUBLIC_SUPABASE_URL=https://qqxxjhojadmzyvpdyjvc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_hbV_6CUrnuw6EWjf7NQo_w_6r_HC1gM
SUPABASE_SERVICE_ROLE_KEY=<paste secret / service_role key from Supabase dashboard>
NEXT_PUBLIC_APP_URL=https://i-sched.vercel.app
```
