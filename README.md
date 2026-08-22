# POS Integration Checklist

A single-file, static checklist tool for POS implementations. Pick a client and their POS
provider, and the checklist builds itself from the provider data baked into the page.

- **`index.html`**: the whole app. No build step, no dependencies, no server.
- **`SUPABASE.md`**: schema and Cloud sync setup, storage moved off this browser.
- **`.claude/`**: a tiny local static server, only for previewing before you push.

## What's in it

Three pages, all in one file.

**Checklist tab** builds an 11-phase checklist for the selected POS, with four hard gates.

| Feature | Where |
| --- | --- |
| Provider brief: who you wait on, item mapping, documentation confidence, first move | top of the checklist |
| Credentials sidebar, one checkbox per credential | right side, stacks below on mobile |
| Complexity rating (Simple / Standard / Complex) | inline on the Phase 0 rating item |
| Automatic go-live target date | sidebar, derived from first tick plus the complexity buffer |
| Known limitations for the selected POS | sidebar |
| Special case note | sidebar |
| Per-item notes and completion dates | each checklist item |
| Print, copy as text, reset progress, delete client | toolbar |

**Health Sheet tab** is the per-client record you sign your name to: scope and contacts,
a gate log that reads its status from the checklist, a variance log that calculates the
percentage against the 1% KPI, the Day 7 and Day 30 audit summaries, a friction log, the
sign-off block and the Day 30 close.

**Client Tracker tab** lists every saved client with a health status, sortable columns,
search, and per-row delete. Health cards filter the table; clicking a row opens that
client's checklist.

## Go-live target dates

The target is derived, not typed. It is the date you ticked your **first** checklist item
plus the buffer the complexity rating carries:

| Rating | Buffer | Reasoning |
| --- | --- | --- |
| Simple | 14 days | Charter baseline: go-live at the end of week 2 |
| Standard | 21 days | One week of buffer |
| Complex | 30 days | Two weeks of buffer, which is what rating it Complex is for |

Before any item is ticked the field stays empty. Editing the date by hand pins it, and a
link appears to go back to the automatic value. Buffers live in the `CX` array in
`index.html`.

## Storage

Everything is saved in the browser's `localStorage`, under keys prefixed `posck:`, and
that's still true with cloud sync on: local storage is the cache, Supabase is where the
team's copy lives.

Without cloud sync configured: **progress is per-browser and per-device.** Two people
opening the same published URL see their own separate data, and clearing site data wipes
it. With it configured (see `SUPABASE.md`), signing in with a magic link syncs every
client to a shared Supabase project, and the Client Tracker shows the whole team's
clients. Up to 100 clients are kept in the local index either way. Deleting a client
profile is permanent, in both places, so use Copy as text first if you want a record.

## Integration Owner role

This tool is the system of record for the Integration Owner charter (reports to Randhir).
Most of the charter was already built in before this was written down anywhere; this table
just makes the mapping explicit.

| Duty | Where it lives here |
| --- | --- |
| On every implementation from kickoff, complexity rating within 48h | Phase 0 rating item, sidebar complexity field |
| Owns the pre-go-live checklist for every client | The whole app |
| Formal go-live sign-off — required approver, not cc, no go-live without it | Phase 8 "Go-live sign-off" gate + the Health Sheet sign-off block |
| Day 7 / Day 30 audit: sales variance, recipe depletion, ticket trend | Phases 9-10 + the Health Sheet variance log and Day 7/30 fields |
| Business-day cutoff time — the single highest-priority failure mode | Called out at Phase 1, Phase 6, both post-go-live audits, and the sidebar |
| Living POS playbook: quirks, mapping conventions, failure modes | "Known limitations" sidebar, per provider — empty ones are flagged as a playbook gap, not a clean bill of health |
| Ranked friction log feeding the monthly report to Product | Health Sheet friction log |

Two things the charter calls for that have no home here yet, because they need real input
rather than a guess:

- **Square POS, Redcat, and Revel have empty "known limitations" entries.** These are the
  three named as priority POS to get hands-on with (combos, sizing, real-time behaviour).
  Once tested, their quirks go in the `limits` array for that provider in `index.html`.
- **No recipe-building standard yet** — naming conventions, yield handling, modifier
  mapping, sub-recipe structure, unit-of-measure rules. This is a standard to define, not
  something to infer from the code, so it's not stubbed in here. Once it exists, it likely
  belongs as its own reference next to "Known limitations," or a linked doc CSMs are
  pointed to from there.

## Run it locally

```bash
node .claude/serve.js
```

Then open <http://localhost:8412>. Opening `index.html` straight off disk works too,
`localStorage` behaves slightly differently on `file://` URLs, so the local server is
the closer match to how it will behave once published.

## Health levels

Calculated live from completion %, days since kickoff, days since last activity, and how
close the go-live target is. Thresholds all live in `healthOf()` in `index.html`.

| Level | Triggered by |
| --- | --- |
| **Critical** | Past the go-live target; or 7+ days inactive under 80%; or 30+ days since kickoff under 70% |
| **Needs attention** | Target within 7 days under 70%; or 5+ days inactive under 60%; or 21+ days in under 70%; or 14+ days in under 50% |
| **On track** | Anything else still in progress |
| **Complete** | Every item checked |
