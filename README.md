# Plumb

An approval-queue console for changes an AI proposes but a human decides. The tools that
detect documentation drift all stop at a report, and a report has no state. Plumb makes it a
queue with state (pending, approved, rejected): a change you can act on is governed, a change
you can only read is not.

![Plumb's review queue: a confidence-and-severity triage with a policy slider that sets the auto-approve line](docs/plumb-hero.png)

The repo is named **earned autonomy** after the idea it proves: autonomy is earned one action
at a time, not granted by default. (Plumb is pronounced "plum," like the fruit.)

## What this is

Plumb scans real documentation for shadcn/ui's Badge component and flags problems like
missing usage guidance or naming that has drifted from the official source. Every flag is a
proposal with a confidence score and the exact change it would write. Nothing gets published
or fixed automatically. A person reviews each flag and decides: approve, skip, or edit the
wording first.

You review whichever way fits the moment. Guided mode walks you through one flag at a time.
The all-at-once view lists everything with a policy slider that shows where the auto-approve
line falls, and higher-risk changes stay with a human at any setting. A separate Sources
view shows the authority hierarchy the flags are measured against: who is the source of
truth, and who owns each doc. Approving a flag shows the pull request it would open; it never
opens one on its own.

One flag in the demo is a labeled false positive, kept on purpose. A queue that never shows
its own misses trains reviewers to rubber-stamp, and reviewer attention is the scarce
resource worth protecting.

The core idea: autonomy is earned one action at a time. It is not granted by default.

## Why the model scores but doesn't decide

It would be easy to let an AI model read each doc, guess a confidence score, and act on
anything it felt sure about. This project deliberately keeps those two jobs apart.

`audit.py` sends each doc to a local model (Ollama, running qwen2.5 through LiteLLM's
tool-calling interface) and asks it to judge the doc against four rules: does it explain
when to use the component, does its wording match the official docs, does it show when it
was last updated, and does it include a proper API reference table. The model rates its own
confidence in each finding.

Here's the part that matters. The model does not get to decide what counts as sure enough to
skip a human. That rule lives in one hardcoded line: anything below 90 confidence is always
sent for review. The model judges the finding, the code enforces the policy, and the model
cannot move the line.

A convincing answer is not the same as a correct one. Keeping the review threshold in code,
where you can read it and the model can't touch it, is the whole point of this project.

## Run it

```
./demo.sh
```

This regenerates `output/flags.json` from `audit.py` and starts Plumb at
[http://localhost:3000](http://localhost:3000). Requires Python 3 and Node.

To run just the scorer, without the UI:

```
python3 audit.py
```

## How it's structured

- **`audit.py`**: the scoring script. Reads `data/*.md`, writes `output/flags.json`.
- **`data/`**: three real docs saved as snapshots, the official shadcn Badge page plus two
  unofficial copies (shadcn.io and a Rails-components port). Real content from each source,
  not authored fixtures. They are saved rather than fetched live; see Known limitations.
- **`output/`**: generated automatically, not checked into git. `flags.json` is the
  scorer's output. `decisions.json` is the human decision log the UI writes to, with an id,
  a decision, a note, and a timestamp for each entry.
- **`ui/`**: Plumb itself, a Next.js and shadcn/ui app that reads `output/flags.json` and
  writes decisions back through a server action. The three screens (start, review queue,
  sources) live in `ui/src/components/plumb/`. See [`ui/README.md`](ui/README.md) for
  details specific to the UI.

## Known limitations

Worth stating plainly rather than hiding:

- `audit.py` scores saved snapshot files, not documentation it fetches live. A real version
  of this would connect to a live API or MCP source instead of static markdown files.
- Scoring runs on a local model through Ollama, so the scorer needs Ollama running, and the
  confidence numbers are the model's own judgment rather than a fixed formula. The one thing
  that is fixed is the review threshold in code, which the model never gets to move.
- Approving a flag shows the diff Plumb would submit as a pull request. It does not open a
  real PR or touch the live doc. That last mile is deliberately left as a shown intent rather
  than a real integration, so the demo stays self-contained.
- One flag in the demo is an authored high-severity example, labeled as authored in the UI.
  The real docs did not produce a high-severity finding this run, so it exists to show how
  Plumb treats a high-blast-radius change: it stays with a human at any autonomy setting and
  needs a deliberate confirmation. Its wording is hand-written; the decision flow around it is
  the real thing.

## Related reading

- Afyia Smith, ["Design System Documentation Needs An Owner"](https://www.linkedin.com/pulse/design-system-documentation-needs-owner-afyia-smith-gjjhe/)
- Emily Campbell, ["Layers of AI Experience"](https://emilycampbell.co/writing/layers-of-ai-experience)
- Matt Pocock's AI skills work draws the same line this project is built on: a model
  produces **facts** (things it found), but **decisions** stay with the human, and a
  model left unchecked will quietly cross that line. Different domain, same boundary.
- Andrei Tarkovsky's *Solaris* (1972). The station's ocean produces things that look and
  feel completely real. Convincing was never the same as true. The crew still had to check.
