<p align="center">
  <img src="ui/src/app/icon.svg" width="90" alt="">
</p>

<h1 align="center">Plumb</h1>

<p align="center"><em>An agent proposes. A person decides. Nothing runs until they do.</em></p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-24282F">
  <img alt="Runs fully local" src="https://img.shields.io/badge/runs-fully%20local-8FB15A">
  <img alt="Next.js + shadcn/ui" src="https://img.shields.io/badge/ui-Next.js%20%2B%20shadcn%2Fui-24282F">
  <img alt="Python + Ollama" src="https://img.shields.io/badge/scoring-Python%20%2B%20Ollama-24282F">
</p>

<p align="center">
  <strong>Under 90 confidence, a human decides. High risk, a human decides.<br>
  One false positive, kept on purpose.</strong><br>
  Those three rules are the product. The <a href="docs/case-study.md">case study</a> explains why.
</p>

---

<p align="center">
  <img src="docs/plumb-demo.gif" width="720" alt="Animated demo: a flag approved instantly at high confidence, a labeled false positive skipped, a below-threshold flag asking for confirmation, and a high-severity change requiring a deliberate acknowledgement before approval.">
</p>

## The approval layer between an AI agent and the world

An agent proposes actions; a human approves, edits, or rejects each one; and how much runs
unattended is a policy you can see and move. Nothing an agent proposes takes effect until a
person decides it should.

This demo wires Plumb to a documentation agent that reviews design-system docs and proposes
fixes, but the queue is the point, not the docs. The same pattern holds for any agent that
acts: a proposal has state (pending, approved, rejected), and state is what makes an action
reviewable instead of just executed.

The repo is named **earned autonomy** after the idea it proves: autonomy is earned one action
at a time, not granted by default.

**Why "Plumb":** a plumb bob is the weighted string that shows a structure is true. Plumb is
the check between an agent and the world, where every action is measured against a human's
judgment before it takes effect. (Said like the fruit, "plum.")

## Why it exists

I spent four years at a design systems company watching component docs drift. They lived in
two places at once, Storybook and Figma, with nothing declaring which was official, so "the
source of truth" was tribal knowledge. Components changed without the docs changing, and the
gap was always found downstream by whoever trusted the docs most. That is a governance
failure, not a tooling failure, and it is the same failure that happens when an AI agent edits
a codebase without review: a change nobody decided to trust.

The tools that detect this kind of drift all stop at a report, and a report has no state.
Plumb makes it a queue. Every finding is a proposal with a confidence score, not an action,
and the model does not get to decide what counts as sure enough to skip a human: that
threshold is one hardcoded line the model cannot move.

One flag in the demo is a labeled false positive, kept on purpose. A queue that hides its own
mistakes trains reviewers to rubber-stamp, and a rubber stamp destroys the governance layer
the tool exists to provide. Precision matters more than recall when the scarce resource is
reviewer attention.

[Full case study →](docs/case-study.md)

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

_Plumb is a personal project, built on public shadcn/ui documentation and a local open model.
It uses no proprietary, client, or employer data._

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
