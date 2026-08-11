# Supabase — the account store

Sign-up and sign-in read and write one table, `public.users`. This directory holds the schema for
it and the notes on wiring it up.

The application has two backends for that table and picks between them purely on configuration:

| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Where accounts live |
| --- | --- |
| set | Supabase (Postgres) |
| not set | `app/data/users.json` on disk |

The JSON file is what a fresh clone runs on and what the test suite exercises, so this repo still
works with no credentials at all. **It is not usable in production**: on a serverless host the
application directory is read-only, so every sign-up fails with a 500, and on any host the file is
inside the deployed tree and is wiped by the next deploy. Production needs Supabase.

Nothing else in the app changes between the two. The same code builds the same record either way,
so an account created locally against the file and one created in production against Postgres are
the same object, field for field.

---

## 1. Create the project

<https://supabase.com/dashboard> → **New project**. Any region near your users; for an India-facing
app, Mumbai (`ap-south-1`) is the closest.

Use one project per environment. Pointing local development at the production project means your
test sign-ups land in the real accounts table.

## 2. Apply the schema

Dashboard → **SQL Editor** → **New query** → paste [`schema.sql`](./schema.sql) → **Run**.

It is safe to run more than once — every statement is `if not exists` — so re-run it after pulling
a change rather than trying to work out what is missing.

## 3. Collect the two values

Dashboard → **Project Settings** → **API**:

- **Project URL** → `SUPABASE_URL`
- The **secret** key → `SUPABASE_SERVICE_ROLE_KEY`

Supabase has two key formats in circulation, and which you see depends on the project's age:

| Format | Browser-safe, RLS applies | Server-only, bypasses RLS |
| --- | --- | --- |
| current | `sb_publishable_...` | `sb_secret_...` |
| older | `anon` (a JWT) | `service_role` (a JWT) |

**This app needs the right-hand one.** The two sit next to each other on the same page, and picking
the wrong one is the single easiest mistake in this setup: the publishable key is governed by RLS,
and the `users` table denies everything to it on purpose, so sign-in fails with a permissions error
that looks nothing like "wrong key". `scripts/check-supabase.mjs` detects it by prefix and says so.

> The secret key bypasses row-level security. Never give it a `NEXT_PUBLIC_` name — anything so
> prefixed is compiled into the browser bundle, which publishes it. The app never sends it to the
> browser, and the check script fails if it finds it under a public name.
>
> The publishable/anon key is not needed by this app at all — nothing reads accounts from the
> browser. You can leave it unset.

## 4. Set the environment

Locally, in `.env` (already gitignored — see [`.env.example`](../.env.example) for the full list):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Not Supabase, but sign-in is not safe in production without it — see below.
AUTH_TOKEN_SECRET=<64 hex characters>
```

In production, set the same three as environment variables on the host (Vercel → Settings →
Environment Variables, and mark them for Production **and** Preview if previews should work).

Restart `next dev` after changing `.env`. Next reads it at startup.

## 5. Check it

```bash
node scripts/check-supabase.mjs
```

This verifies the project is reachable, the table exists, every column the store writes is present,
and — if an anon key is configured — that RLS really does keep it out of the users table. It writes
nothing and creates no accounts. Run it once locally and once with production's values.

Then create the first account by signing up at `/signup` as normal.

---

## The super admin

`app/lib/admin-access.ts` hardcodes `SUPER_ADMIN_EMAIL`. Any account created with that address is
given `role: "admin"` at sign-up, by `createUser`, in either backend. So the super admin is made by
signing up with that email on an empty table — no seeding step, no SQL insert.

`ADMIN_EMAILS` (comma-separated) promotes further addresses the same way. To promote an account
that already exists, use `node scripts/make-admin.mjs <email>` — note that it edits the JSON file,
so against Supabase change the row from the dashboard instead:

```sql
update public.users set role = 'admin' where email = 'someone@example.com';
```

## `AUTH_TOKEN_SECRET`

Not a Supabase setting, but the one thing that will still be wrong in production after the database
is connected, so it is worth saying here.

Session tokens are `HMAC(user_id.email, AUTH_TOKEN_SECRET)`. When the variable is unset the app
falls back to a literal string committed to this repository, which means anyone who has read the
source can mint a valid session for any account — including the super admin. Generate one per
environment:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Changing it later signs everyone out, which is harmless — they sign in again.

## Notes on the schema

- **Timestamps are `text`, not `timestamptz`.** The application compares and sorts them as strings
  (`subscribed_until` is an IST calendar date compared with `>=` against `todayIST()`), and letting
  Postgres reformat them makes those comparisons disagree with the ones the JSON backend makes. The
  reasoning is written out at the column in `schema.sql`. ISO-8601 UTC sorts lexically in
  chronological order, so `order by created_at desc` still does the right thing.
- **`id` is generated by the app, not by Postgres.** Existing session tokens have ids baked into
  them, so the app has to mint them.
- **Uniqueness on `email` is enforced by the index, not by a read-first check.** Two simultaneous
  sign-ups for the same address would both pass a check-then-insert; the constraint cannot be
  raced. The store turns PostgREST's `23505` back into "this email is already registered".
- **RLS is on with no policies.** That is what denies the public anon key access to a table of
  password hashes. Do not add a permissive policy — nothing in this app reads the table from the
  browser.

## If something fails

| Symptom | Cause |
| --- | --- |
| Sign-up returns 500, logs `relation "public.users" does not exist` | `schema.sql` has not been applied to *this* project |
| Sign-up returns 500, logs `permission denied for table users` | The key is the `anon` key, not `service_role` |
| Logs `Could not reach Supabase` | Wrong `SUPABASE_URL`, or the project is paused (free projects pause after inactivity) |
| Accounts vanish after a deploy | The variables are not set in production, so it is still using the JSON file |
| Everything works locally, nothing works in production | The variables were added to Vercel but the project was not redeployed |
