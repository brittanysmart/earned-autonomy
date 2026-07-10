---
source: shadcn.io/ui/badge
authority: unofficial_mirror
last_fetched: 2026-07-05
owner: No owner declared
---

# Shadcn Badge

A React badge component for status indicators, notification counts, and labels, built with
TypeScript, Tailwind CSS, and CVA (class-variance-authority) for type-safe variants.

## Variants
- default – primary information and active states
- secondary – neutral information and metadata
- destructive – errors, warnings, urgent alerts
- outline – subtle tags and filters

## Usage Guidance
- Keep text minimal: "NEW" reads better than a long label.
- Maintain color consistency: reserve destructive styling for actual errors so users don't
  learn to distrust the color.
- Cap notification counts: show "99+" instead of exact numbers past a reasonable threshold.
- Verify accessibility: test custom color contrast independently of the defaults.
- Use sparingly: over-badging dilutes what a badge is supposed to draw attention to.

## API Reference
| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| variant | string | "default" | Visual style selection |
| className | string | — | Custom CSS classes |
| children | ReactNode | — | Badge content |

## Installation
npx shadcn@latest add badge

Fetched directly from the live docs page on 2026-07-05; no synthetic content added.
