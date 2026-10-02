# Plan: Login + shared notes (deferred — not being built now)

Status: **saved for later, not implemented.** No code written.

## Scope decisions (final)

- **Attendance stays in `localStorage`.** No DB, no sync. `js/store.js` untouched.
- **File storage provider: undecided.** Access only through a one-file adapter
  (`js/storage.js`) so the provider is a later swap.
- Only cloud pieces: **auth + profiles + notes metadata**.

## Backend: Supabase (free)

Auth + Postgres, least work. At ~2k users with no file bytes, free-tier limits
(50k MAU, 500 MB DB) are irrelevant, and there's no egress wall. No pause risk
while users are active.

Rejected: Firebase (NoSQL, 20k writes/day cap, egress), Cloudflare (would need
hand-built auth).

## Data model

```sql
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  section text,
  created_at timestamptz default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references auth.users on delete cascade,
  title text not null,
  description text,
  course_code text,
  section text,                 -- null = visible to everyone
  file_path text,               -- object path once storage provider is chosen
  file_name text,
  file_size bigint,
  mime text,
  created_at timestamptz default now()
);
```

RLS (trust boundary — do not skip):

```sql
alter table profiles enable row level security;
create policy "read profiles" on profiles for select to authenticated using (true);
create policy "ins self" on profiles for insert to authenticated with check (id = auth.uid());
create policy "upd self" on profiles for update to authenticated using (id = auth.uid());

alter table notes enable row level security;
create policy "read notes" on notes for select to authenticated using (true);
create policy "ins own"   on notes for insert to authenticated with check (author = auth.uid());
create policy "upd own"   on notes for update to authenticated using (author = auth.uid());
create policy "del own"   on notes for delete to authenticated using (author = auth.uid());
```

## File storage adapter (provider TBD)

```js
// js/storage.js — the ONLY file that changes when a provider is picked
export async function put(file, path) { /* TODO provider */ }
export async function getUrl(path) { /* TODO provider */ }
export async function remove(path) { /* TODO provider */ }
```

Options when the time comes:
- **Supabase Storage** — zero new services; 1 GB storage / 5 GB egress on free.
- **Cloudflare R2** — 10 GB + $0 egress; needs a small Worker for signed URLs.

Start Supabase, move to R2 only if note downloads strain it.

## Frontend changes

- **New** `js/supabase.js` — client singleton + project URL/anon key (anon key is
  public-safe; RLS enforces access).
- **New** `js/auth.js` — magic-link sign-in/out, session listener, profile create.
- **New** `js/notes.js` — list/filter, upload/download/delete via the adapter.
- **New** `js/storage.js` — adapter stub above.
- **Edit** `index.html` — "Sign in" chip + Notes tab.
- **Edit** `js/app.js` — wire chip + mount notes view.
- **Edit** `sw.js` — add new JS to `ASSETS`, bump cache version.

## Offline story

Attendance keeps working offline exactly as today. Login/notes are online-only.

## Phases

| Phase | Scope | Effort |
|---|---|---|
| 0 | Supabase project, SQL, RLS, `js/supabase.js` | ½ day |
| 1 | Magic-link auth + profile + topbar chip | 1 day |
| 2 | Notes tab wired to storage adapter (stub provider) | 1 day |
| 3 | Pick provider, fill `js/storage.js`, upload/download works | ½–1 day |

## Caveats

- Free projects can pause after inactivity — a daily cron ping or Pro ($25/mo)
  avoids it.
- Consider restricting signup to the university email domain.
- Cap uploads (size + MIME) once storage is live.

## Skipped on purpose (YAGNI)

No attendance sync, no own server, no custom password auth, no comments/votes,
no admin panel until abuse actually appears.
