# Design System Knowledge Audit — starter files

## What this is
A small agent that scores real shadcn/ui Badge documentation (official + two unofficial
mirrors) against four governance criteria: judgment boundaries, terminology consistency,
staleness/drift, and retrievability. Every output is a *proposed* flag with a confidence
score — nothing auto-executes. That governance thesis (autonomy earned per-action, not
granted by default) is the through-line for the whole portfolio piece.

## Files
- `audit.py` — the scoring script. Reads `data/*.md`, writes `output/flags.json`.
- `data/` — three real snapshot docs (official shadcn Badge docs + two mirrors), each with
  frontmatter (source, authority, last_fetched) and body text.
- `output/flags.json` — the current run's output: 7 flags, ready to feed a UI.

## Run it
```
python3 audit.py
```

## Next step (in Claude Code)
Build the Approval Queue UI:
- Next.js + shadcn/ui (matches your resume stack)
- Reads `output/flags.json`, renders each flag as a queue item: component, source,
  criterion, severity, confidence, evidence, proposed action
- Approve / Reject / Edit controls per item — nothing executes without a click
- Visually distinguish `requires_human_review: true` items from the one auto-flaggable
  item (confidence 95, official docs judgment_boundaries gap) — that contrast is the whole
  point of the demo
- Log the human decision (approved/rejected + timestamp) back to a local file or simple
  state, so the "audit trail" argument (Afyia Smith's piece) is visible, not just claimed

## Known limitations to be upfront about in interviews
- `audit.py` scores saved snapshot files, not a live fetch — the next iteration would wire
  it to a real MCP/API source (Figma `use_figma`, or a docs-site scraper) instead of static
  markdown snapshots.
- Scoring is regex/heuristic-based on purpose, not an LLM call — this keeps the logic
  inspectable and the confidence numbers explainable line-by-line, which is a better
  interview story than an opaque model judgment. Worth naming as a deliberate choice, not
  a limitation you're hiding.

## Source references
- Afyia Smith, "Design System Documentation Needs An Owner" (June 2026)
- Emily Campbell, "Layers of AI Experience" — Governance and Harness layers
