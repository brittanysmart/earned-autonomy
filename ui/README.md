# Approval Queue UI

This is the frontend half of [Earned Autonomy](../README.md). It's a Next.js and
shadcn/ui app that reads `../output/flags.json` and shows each flag as a card: component,
source, category, severity, confidence, evidence, and a suggested action. Approve, Reject,
and Edit buttons on each card write a decision to `../output/decisions.json`. Nothing
happens until a person clicks one of those buttons.

## Run it

From the repo root, `./demo.sh` regenerates the data and starts this app in one step.

To run just the UI on its own, the repo-root `.venv` needs to exist first (created
automatically by `./demo.sh`, or manually with `uv venv ../.venv && uv pip install
--python ../.venv/bin/python -r ../requirements.txt` from this directory):

```bash
npm install
npm run dev
```

The `predev` script runs `audit.py` through that `.venv` automatically first (it calls a
local model via Ollama, so Ollama needs to be running), so `output/flags.json` is always
current. Then open [http://localhost:3000](http://localhost:3000).

## Notes

- Data only flows one way for most of this app: `audit.py` (Python) writes
  `output/flags.json`, and this app only reads it. The one exception is the
  `recordDecision` server action in `src/app/actions.ts`, which appends to
  `output/decisions.json`. That file is real and plain text, so you can open it directly
  to confirm the decision log isn't just something the UI is pretending to track.
- This app runs locally on purpose. It's not deployed anywhere. It reads and writes plain
  files on disk (`output/flags.json`, `output/decisions.json`) instead of a database, which
  is what makes the decision log easy to inspect. There's no hosted backend behind it.
