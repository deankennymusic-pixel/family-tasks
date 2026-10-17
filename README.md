# Family Tasks

One shared task list for a household. Both parents sign in with Google, see the
same list, and every change shows up on the other phone within a second or two.
It installs to the home screen as a Progressive Web App.

V1 scope: Google sign-in, one household with invite-by-email, create / edit /
complete / reopen / delete tasks, live sync, installable PWA. Nothing else.

## How it works

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router) + TypeScript, Tailwind CSS 4 |
| Data | Supabase Postgres, row level security on every table |
| Auth | Supabase Auth, Google provider, PKCE redirect flow |
| Sync | Supabase Realtime (`postgres_changes` on `tasks`) |
| Hosting | Vercel |

The app runs in the browser and talks to Supabase directly with the public anon
key. Every table has row level security, so a signed-in user can only read or
change rows in their own household, whatever requests they craft. Household
changes (create, invite, accept, cancel) go through `SECURITY DEFINER`
functions that check the caller. No privileged key is used anywhere in the app.

- `supabase/migrations/` – schema, policies, functions, realtime publication
- `src/hooks/use-tasks.ts` – loading, optimistic updates, realtime, retry
- `src/hooks/use-household.ts` – household, members, invites
- `src/lib/task-list.ts` – the pure state logic for the list (unit tested)
- `public/sw.js` – service worker (installable, opens offline)

**Sync and failures.** Changes appear immediately on the phone that made them
and are confirmed by the server. Realtime pushes them to the other phone. When
the app returns to the foreground or the network comes back, it refetches the
list to catch up on anything missed. If a new task can't be saved it stays in
the list marked "Not saved · Retry", is kept in local storage across restarts,
and is retried automatically when the connection returns. Failed edits,
completions and deletes are rolled back with a message and a Retry button.

**Data model.** `profiles` (from Google), `households`, `household_members`
(one household per person in V1), `household_invites` (by email), `tasks`
(`id`, `title`, `household_id`, `created_by`, `completed`, `completed_at`,
`created_at`, `updated_at`). Authorship and timestamps are set by the database,
not the client.

## Setup

You need a Supabase project, a Google OAuth client and a Vercel project.
Replace `YOUR-APP.vercel.app` and `YOUR-REF` below with your own values.

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Open **SQL Editor**, paste the contents of
   `supabase/migrations/20261017000000_init.sql` and click **Run**.
   (With the Supabase CLI instead: `supabase link` then `supabase db push`.)
3. **Project Settings → API**: copy the **Project URL** and the **anon /
   publishable key**. These are the two environment variables below.

New schema changes go in a new, timestamped file in `supabase/migrations/`.
Never edit a migration that has already been applied.

### 2. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project, then **APIs & Services → OAuth consent screen**: choose
   *External*, name the app, and add both parents' Gmail addresses as test
   users (or publish the app).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origins: `https://YOUR-APP.vercel.app`
   - Authorized redirect URIs: `https://YOUR-REF.supabase.co/auth/v1/callback`
3. In Supabase, **Authentication → Sign In / Providers → Google**: enable it
   and paste the client ID and client secret.
4. In Supabase, **Authentication → URL Configuration**:
   - Site URL: `https://YOUR-APP.vercel.app`
   - Redirect URLs: `https://YOUR-APP.vercel.app/**` and
     `http://localhost:3000/**`

### 3. Vercel

1. **Add New → Project**, import this GitHub repository.
2. Add the environment variables below, then **Deploy**.
3. Every push to `main` redeploys.

### Environment variables

| Name | Where from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | `https://YOUR-REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Public by design; RLS protects data |

Copy `.env.example` to `.env.local` for local development. Never add the
`service_role` key to this app.

## Inviting your partner

1. Dean signs in first. A household called "Our Tasks" is created.
2. Tap your avatar (top right) → type Lu's Google email → **Invite**.
3. Lu opens the app and signs in with that Google account. She sees "Dean
   invited you to share Our Tasks" → **Join**.

If Lu signed in before being invited, she gets a "Join" banner at the top of
her list instead; any tasks she'd added come with her.

## Installing on a phone

**iPhone (Safari):** open the app URL in Safari → tap **Share** → **Add to
Home Screen** → **Add**. Open it from the home screen and sign in there (the
home-screen app keeps its own sign-in, separate from Safari).

**Android (Chrome):** open the app URL in Chrome → tap **⋮** → **Add to Home
screen** (or **Install app**) → **Install**.

Sign-in persists; reopening the app doesn't ask again.

## Development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
npm run dev                   # http://localhost:3000
```

## Tests

```bash
npm run lint && npm run typecheck
npm test            # unit tests (list state, formatting)
npm run test:db     # migrations + row level security, on real Postgres
npm run test:e2e    # two browsers syncing, against an in-memory fake Supabase
```

- `test:db` applies the migrations to Postgres 16 with a small stand-in for
  Supabase's `auth` schema, then signs in as Dean, Lu and a stranger and checks
  what each can see and change. It starts a throwaway cluster, or uses
  `TEST_DATABASE_URL` if set (must be an empty, disposable database).
- `test:e2e` builds the app and drives two phones (Dean and Lu) side by side:
  invite, join, create, complete, reopen, edit, delete, and a failed save that
  survives a restart. The fake backend speaks the Realtime protocol, so this
  exercises the real sync code; it does not prove the Supabase configuration.

CI (`.github/workflows/ci.yml`) runs all of these.

## Acceptance test (two real phones)

Automated tests don't replace this. On the deployed URL:

1. Both install the app and sign in with their own Google accounts.
2. Dean invites Lu; Lu joins. Both avatars appear under Household.
3. Dean adds "Buy milk" → it appears on Lu's phone.
4. Lu adds a task → it appears on Dean's phone.
5. Lu ticks "Buy milk" → it moves to Completed on Dean's phone.
6. Reopen, edit and delete a task; each change shows on the other phone.
7. Close and reopen the app: still signed in.
8. A third Google account signs in and sees an empty list of its own.

## Known limitations

- One household per person, one list per household (by design for V1).
- Removing a member from a household isn't in the UI yet.
- iOS keeps the home-screen app's sign-in separate from Safari's, so sign in
  from the installed app.
- Deleting a task can't be undone.
