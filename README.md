# Earned Autonomy

## What this is

A small demo of a bigger idea: AI agents should propose actions, not take them
automatically.

This project scans real documentation for shadcn/ui's Badge component and flags problems
like missing usage guidance or outdated docs. Every flag comes with a confidence score.
Nothing gets published, changed, or fixed automatically. A human looks at each flag in the
Approval Queue UI and decides: approve, reject, or edit.

The core idea: autonomy is earned one action at a time. It is not granted by default.

## Why the scoring is plain code, not an AI model

It would be easy to have an AI model read each doc and guess a confidence score. This
project deliberately does not do that.

Instead, `audit.py` uses plain pattern matching (regex) to check documentation against four
rules: does it explain when to use the component, does its wording match the official docs,
does it show when it was last updated, and does it include a proper API reference table.

Here's why that matters. With plain code, every confidence number traces back to one visible
line you can read. If a flag says "88% confident," you can open `audit.py`, find the exact
check that produced that number, and see exactly why. Nothing is hidden and nothing has to
be taken on faith.

An AI model's confidence score would look the same on screen, but you could never point to
the exact reasoning behind it. That gap, between a number you can verify and a number you
just have to trust, is the whole point of this project.

## Run it

```
./demo.sh
```

This regenerates `output/flags.json` from `audit.py` and starts the Approval Queue UI at
[http://localhost:3000](http://localhost:3000). Requires Python 3 and Node.

To run just the scorer, without the UI:

```
python3 audit.py
```

## How it's structured

- **`audit.py`**: the scoring script. Reads `data/*.md`, writes `output/flags.json`.
- **`data/`**: three sample docs, the official shadcn Badge docs plus two unofficial
  copies. These are written as fixtures, each one built to demonstrate a specific problem,
  not pulled live from the web.
- **`output/`**: generated automatically, not checked into git. `flags.json` is the
  scorer's output. `decisions.json` is the human decision log the UI writes to, with an id,
  a decision, a note, and a timestamp for each entry.
- **`ui/`**: the Approval Queue itself, a Next.js and shadcn/ui app that reads
  `output/flags.json` and writes decisions back through a server action. See
  [`ui/README.md`](ui/README.md) for details specific to the UI.

## Known limitations

Worth stating plainly rather than hiding:

- `audit.py` scores saved snapshot files, not documentation it fetches live. A real version
  of this would connect to a live API or MCP source instead of static markdown files.
- The scoring is regex based, not an AI model, on purpose. See above for why that's a
  deliberate choice, not a shortcut.

## Related reading

- Afyia Smith, ["Design System Documentation Needs An Owner"](https://www.linkedin.com/pulse/design-system-documentation-needs-owner-afyia-smith-gjjhe/)
- Emily Campbell, ["Layers of AI Experience"](https://emilycampbell.co/writing/layers-of-ai-experience)
