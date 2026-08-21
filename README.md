# POS Integration Checklist

A single-file, static checklist tool for POS implementations. Pick a client and their POS
provider, and the checklist builds itself from the provider data baked into the page.

- **`index.html`** — the whole app. No build step, no dependencies, no server.
- **`SUPABASE.md`** — schema and adapter for moving storage off this browser.
- **`.claude/`** — a tiny local static server, only for previewing before you push.

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

Everything is saved in the browser's `localStorage`, under keys prefixed `posck:`.

That means: **progress is per-browser and per-device.** Two people opening the same
published URL see their own separate data, and clearing site data wipes it. Up to 100
clients are kept in the index. Deleting a client profile is permanent and there is no
backup, so use Copy as text first if you want a record. If you need shared data across
the team, that's what `SUPABASE.md` is for.

## Run it locally

```bash
node .claude/serve.js
```

Then open <http://localhost:8412>. Opening `index.html` straight off disk works too —
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
