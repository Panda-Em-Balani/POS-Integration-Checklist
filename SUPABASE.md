# Moving storage to Supabase

Right now `index.html` keeps everything in the browser's `localStorage`. This file is the
plan for moving it to Supabase so the whole team sees the same data.

## Read this part first

GitHub Pages serves static files. There is no server and no build step, so anything the
page does with Supabase happens **in the visitor's browser, using code they can read**.
That changes what is safe to put in this repo.

| Key | Safe in this repo? | Why |
| --- | --- | --- |
| Project URL | Yes | Public by design |
| `anon` / publishable key | Yes, **but only with RLS on every table** | It is meant to be public. It is not a password. Row Level Security is the thing that actually restricts access |
| `service_role` key | **Never** | Bypasses all RLS. In a public repo this is a full data breach, and rotating it is the only fix |

If Pages is on the free tier, the repo has to be **public** for the site to publish, so
treat everything committed here as world-readable. The anon key is meant to be public
(that's what RLS is for), so it's fine either way, but as a habit: don't paste it into
this chat, edit the two placeholder lines in `index.html` yourself.

**Do this before writing any front-end code:** turn on RLS for both tables below and add
the policies. A table with the anon key exposed and RLS off is readable and writable by
anyone who views source.

## Schema

Run this in the Supabase SQL editor.

```sql
-- One row per client + POS pairing
create table public.checklists (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) default auth.uid(),
  client_name   text not null,
  pos_provider  text not null,
  go_live_target date,
  special_note  text not null default '',
  -- denormalised so the tracker is one cheap query. The front-end owns these,
  -- because the total item count depends on which POS was selected.
  done_items    integer not null default 0,
  total_items   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, client_name, pos_provider)
);

-- One row per checked item / note. Keyed on the stable item ids in index.html
-- (k-review, pre-cutoff, cred-0, rec-1pct, ...), never on array position.
create table public.checklist_items (
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  item_id      text not null,
  done         boolean not null default false,
  done_at      timestamptz,
  note         text not null default '',
  updated_at   timestamptz not null default now(),
  primary key (checklist_id, item_id)
);

create index on public.checklists (owner_id, updated_at desc);
create index on public.checklist_items (checklist_id);

alter table public.checklists      enable row level security;
alter table public.checklist_items enable row level security;
```

**Already ran the block above before this update?** Three columns were added since
(complexity rating, the manual-target flag, and the Health Sheet) and the delete policy
below was missing from the original write-up. Run this once, it's safe to run even if a
column already exists:

```sql
alter table public.checklists
  add column if not exists complexity     text not null default '',
  add column if not exists go_live_manual boolean not null default false,
  add column if not exists health_sheet   jsonb not null default '{}'::jsonb;

create policy "owner deletes" on public.checklists
  for delete using (owner_id = auth.uid());
```

That last policy was the actual gap: without it, deleting a client profile from the
Checklist toolbar or the Client Tracker fails silently once the front-end talks to
Supabase, because Postgres denies any command with no matching policy. `checklist_items`
already has a `for all` policy on the owner, which covers its delete case, including the
automatic cascade delete when a `checklists` row goes.

### Policies, pick one shape

**A. Private per user.** Everyone sees only their own clients. Simplest, but you lose the
team-wide view, which is most of the point of the tracker.

```sql
create policy "own checklists" on public.checklists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own items" on public.checklist_items
  for all using (exists (
    select 1 from public.checklists c
    where c.id = checklist_id and c.owner_id = auth.uid()
  ));
```

**B. Shared across signed-in staff.** Anyone who is signed in reads everything; only the
owner edits their own rows. This is the one that matches how you'd actually use the
tracker. Restrict *who can sign in* in Supabase Auth (allow-list the `supy.io` domain,
disable public sign-ups). RLS controls what a signed-in user can touch, not who gets an
account.

```sql
create policy "staff read all" on public.checklists
  for select using (auth.role() = 'authenticated');
create policy "owner writes" on public.checklists
  for insert with check (owner_id = auth.uid());
create policy "owner updates" on public.checklists
  for update using (owner_id = auth.uid());
create policy "owner deletes" on public.checklists
  for delete using (owner_id = auth.uid());

create policy "staff read all items" on public.checklist_items
  for select using (auth.role() = 'authenticated');
create policy "owner writes items" on public.checklist_items
  for all using (exists (
    select 1 from public.checklists c
    where c.id = checklist_id and c.owner_id = auth.uid()
  ));
```

There is no third option worth taking. An anon-writable table on a public URL will get
filled with junk sooner or later, and you cannot tell who wrote what.

## The front-end change: already done

`index.html` now has the Supabase integration built in. `localStorage` stays as the
cache exactly as planned below: a checkbox click never waits on the network, and the
page keeps working if wifi drops mid-visit at a client site. Two things turn it on.

### 1. Fill in two lines

Near the very top of the `<script type="module">` block:

```js
var SUPABASE_URL = "REPLACE_WITH_YOUR_SUPABASE_PROJECT_URL";
var SUPABASE_ANON_KEY = "REPLACE_WITH_YOUR_SUPABASE_ANON_KEY";
```

Both values are in the Supabase dashboard under **Settings -> API**: the Project URL
and the `anon` / `public` key. Replace the two placeholder strings with them, in your
own editor (this key is meant to be public once RLS is on, so there's nothing sensitive
about it living in this file, but keep the habit of not pasting it into chat).

Leaving the placeholders in place is a valid, permanent choice too: the page detects
them and runs exactly as it did before, localStorage only, nothing sent anywhere.

### 2. What actually happens when it's turned on

- A small bar above the client name field lets someone sign in with a magic link (their
  email, no password). Sign-up is closed, so only accounts you added under
  **Authentication -> Users** can get in.
- Opening a client: reads the local cache and Supabase at the same time, and Supabase
  wins if it answers, since a colleague may have moved the client on since your last
  visit. Falls back to the local copy if Supabase doesn't answer.
- Every save: writes to `localStorage` first (instant), then upserts to Supabase in the
  background. A save never blocks on the network and never throws if Supabase is
  unreachable, since the local copy is already safe either way.
- Deleting a client: deletes locally and remotely.
- The Client Tracker: on open, and on the **Refresh from cloud** button that appears
  next to the search bar once Supabase is configured, it pulls every signed-in
  colleague's clients and merges in anything of yours that hasn't synced up yet.

The mapping: `collapsed` (which phases are folded shut) stays local only, on purpose,
since syncing it would mean one person collapsing a phase changes the view for everyone.
Everything else in a record (`complexity`, `goLiveTarget`, `specialNote`, `items`, `hs`)
round-trips to the `checklists` and `checklist_items` tables.

### Test this locally before it goes live

1. Fill in the two lines above with your real project's values.
2. `node .claude/serve.js`, open `http://localhost:8412`.
3. Sign in with your own email through the bar at the top, click the link it emails you.
4. Open a client, tick a box, add a complexity rating. Refresh the page. It should
   still be there, that's the round trip through Supabase working.
5. In the Supabase dashboard, **Table Editor -> checklists**, confirm a row appeared
   with your client's name.
6. Delete that client from the toolbar, confirm the row disappears from the table too.
7. Only once all of that works: commit and push, then repeat step 3 on the published
   GitHub Pages URL to confirm it works there as well as it did locally.

### Known limitation: last write wins

Two people editing the same client at the same time overwrite each other silently. This
was true even before Supabase and stays true now. Per-item rows limit the damage to
individual checkboxes rather than the whole checklist, which covers the realistic case
of one person owning each client's integration. If two people are ever meant to work the
same client at once, ask and a proper conflict warning (comparing `updated_at` before
writing) is a contained follow-up.

## While you're here: the HubSpot proxy

HubSpot is deferred, but it's worth knowing the shape now because it affects this
decision. **You cannot call the HubSpot API from this page.** A HubSpot private-app token
can't be exposed in client-side code, and HubSpot doesn't allow browser CORS calls anyway.
You need something server-side holding the token.

Once Supabase is in, that's a **Supabase Edge Function**: the page calls your function
with the user's session, the function holds the HubSpot token as a secret and makes the
call. No separate backend to run. That's the answer to the "backend/proxy approach"
question on your list, and it's exactly why Supabase came first.
