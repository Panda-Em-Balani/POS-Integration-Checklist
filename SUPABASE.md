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

If Pages is on the free tier, the repo has to be **public** for the site to publish —
so treat everything committed here as world-readable. Don't paste any key into a chat
either, including to me; put it in the file yourself.

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

### Policies — pick one shape

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
disable public sign-ups) — RLS controls what a signed-in user can touch, not who gets an
account.

```sql
create policy "staff read all" on public.checklists
  for select using (auth.role() = 'authenticated');
create policy "owner writes" on public.checklists
  for insert with check (owner_id = auth.uid());
create policy "owner updates" on public.checklists
  for update using (owner_id = auth.uid());

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

## The front-end change

`index.html` was written so this is a small edit. Storage is behind one object:

```js
var DB = {
  get: function(k){ ... },
  set: function(k,v){ ... },
  del: function(k){ ... }
};
```

Those three already return Promises and every caller already `await`s / `.then()`s them,
so nothing else in the file has to change structurally. Two keys are used:

- `posck:index` — the array behind the Client Tracker and the saved-client chips.
  Each entry: `{client, pos, pct, done, all, createdAt, updatedAt, goLiveTarget}`.
- `posck:rec:<client lowercased>::<POS>` — one full record:
  `{client, pos, createdAt, updatedAt, goLiveTarget, specialNote, items, collapsed}`
  where `items` is `{ "<item id>": {done, doneAt, note} }`.

### Recommended approach: keep localStorage as a cache

Don't rip `localStorage` out. Write to both, read from Supabase when it's reachable and
fall back to the local copy when it isn't. Checking a box should feel instant and should
survive a dropped connection on site with a client.

1. Add the Supabase JS client. There's no bundler here, so use the ESM build in a
   `<script type="module">` block, or fetch the REST endpoints directly with `fetch()` —
   for three operations, plain `fetch()` against `/rest/v1/` is honestly less machinery.
2. Sign the user in (magic link is the least friction) before the first read.
3. On save: upsert the `checklists` row, then upsert the changed `checklist_items` rows.
   Send only what changed, not the whole `items` object.
4. On load: select the checklist row plus its items, rebuild the `items` object.
5. For the tracker: one `select` over `checklists` gives you every column the tracker
   needs. `posck:index` becomes a cache of that query rather than the source of truth.

### Two things that will bite you

- **`collapsed`** is UI state (which phases are folded shut). Leave it in `localStorage`.
  Syncing it means one person collapsing a phase changes the view for everyone.
- **Last-write-wins.** Two people editing the same client will overwrite each other
  silently. Per-item rows already limit the damage to individual items rather than the
  whole checklist. If that isn't good enough, compare `updated_at` before writing and
  warn instead of clobbering.

## While you're here: the HubSpot proxy

HubSpot is deferred, but it's worth knowing the shape now because it affects this
decision. **You cannot call the HubSpot API from this page.** A HubSpot private-app token
can't be exposed in client-side code, and HubSpot doesn't allow browser CORS calls anyway.
You need something server-side holding the token.

Once Supabase is in, that's a **Supabase Edge Function**: the page calls your function
with the user's session, the function holds the HubSpot token as a secret and makes the
call. No separate backend to run. That's the answer to the "backend/proxy approach"
question on your list — and it's a reason to do Supabase first and HubSpot second.
