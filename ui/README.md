# Approval Queue UI

The frontend half of [earned-autonomy](../README.md) — a Next.js + shadcn/ui app that reads
`../output/flags.json` and renders each flag as a queue item: component, source, criterion,
severity, confidence, evidence, and a proposed action. Approve / Reject / Edit controls per
item write decisions to `../output/decisions.json`; nothing executes until a human clicks.

## Run it

From the repo root, `./demo.sh` regenerates the data and starts this app in one step. To run
just the UI on its own:

```bash
npm install
npm run dev
```

`predev` runs `python3 ../audit.py` automatically first, so `output/flags.json` is always
current. Open [http://localhost:3000](http://localhost:3000).

## Notes

- Data flows one way: `audit.py` (Python) writes `output/flags.json`; this app only reads it.
  The one write path is the `recordDecision` server action in `src/app/actions.ts`, which
  appends to `output/decisions.json` — a real file you can inspect directly to confirm the
  audit trail isn't just UI state.
- This app is designed to run locally, not deployed: it reads and writes plain files on disk
  (`output/flags.json`, `output/decisions.json`), which is what makes the audit trail
  directly inspectable — there's no hosted backend or database behind it.
