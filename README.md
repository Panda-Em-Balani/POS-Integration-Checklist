# POS Integration Checklist

A single-file, static checklist tool for POS implementations. Pick a client and their POS
provider, and the checklist builds itself from the provider data baked into the page.

- **`index.html`** — the whole app. No build step, no dependencies, no server.
- **`SUPABASE.md`** — schema and adapter for moving storage off this browser.
- **`.claude/`** — a tiny local static server, only for previewing before you push.

## What's in it

| Feature | Where |
| --- | --- |
| Per-POS checklist across 11 phases with hard gates | Checklist tab |
| Credentials sidebar with per-credential checkboxes | right side (stacks below on mobile) |
| Go-live target date and special case note | sidebar |
| Known limitations for the selected POS | sidebar |
| Per-item notes and completion dates | each checklist item |
| Client health tracker with 4 health levels | Client Tracker tab |
| Searchable client dropdown | client name field |
| Print view, copy-as-text export | toolbar |

## Storage

Everything is saved in the browser's `localStorage`, under keys prefixed `posck:`.

That means: **progress is per-browser and per-device.** Two people opening the same
published URL see their own separate data, and clearing site data wipes it. Up to 100
clients are kept in the index. If you need shared data across the team, that's what
`SUPABASE.md` is for.

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
