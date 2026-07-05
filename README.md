# Design System Knowledge Audit

## What this is
An agent that scores real shadcn/ui Badge documentation (official docs + two unofficial
copies) against four governance criteria: judgment boundaries, terminology consistency,
staleness/drift, and retrievability. Every output is a *proposed* flag with a stated
confidence score — nothing auto-executes. A human approves, rejects, or edits each one in
the Approval Queue UI. That governance thesis — autonomy earned per action, not granted by
default — is the through-line for the whole project.

## Run it
```
./demo.sh
```
Regenerates `output/flags.json` from `audit.py` and starts the Approval Queue UI at
http://localhost:3000. Requires Python 3 and Node.

To run just the scorer:
```
python3 audit.py
```

## How it's structured
- `audit.py` — the scoring script. Reads `data/*.md`, writes `output/flags.json`. Regex/
  heuristic-based on purpose, not an LLM call, so every confidence number is explainable
  line-by-line rather than resting on an opaque model judgment.
- `data/` — three snapshot docs (official shadcn Badge docs + two unofficial copies),
  authored as fixtures that each demonstrate one drift pattern — not live-crawled pages.
- `output/` — generated, gitignored. `flags.json` is the scorer's output; `decisions.json`
  is the append-only human decision log the UI writes to (id, decision, note, timestamp).
- `ui/` — the Approval Queue: Next.js + shadcn/ui, reads `output/flags.json`, writes
  decisions back via a server action. See `ui/README.md` for UI-specific details.

## Known limitations (worth naming plainly, not hiding)
- `audit.py` scores saved snapshot files, not a live fetch — an obvious next step would be
  wiring it to a real API/MCP source instead of static markdown snapshots.
- Scoring is regex/heuristic-based rather than an LLM call — a deliberate tradeoff for
  explainability, not a shortcut being hidden.

## Related reading
- Afyia Smith, ["Design System Documentation Needs An Owner"](https://www.linkedin.com/pulse/design-system-documentation-needs-owner-afyia-smith-gjjhe/)
- Emily Campbell, ["Layers of AI Experience"](https://emilycampbell.co/writing/layers-of-ai-experience)
