---
source: shadcn.rails-components.com/docs/components/badge
authority: unofficial_port
last_fetched: 2026-07-05
---

# Badge Component (Rails port)

Displays a badge or a component that looks like a badge.

## Installation
`rails generate shadcn-ui badge`

Generates two files: a helper (`badge_helper.rb`) and a view template (`_badge.html.erb`).

## Variants
- default (Badge)
- secondary
- destructive
- outline
- ghost

## Usage
`<%= render_badge text:, variant: %>`

`text:` is required. `variant:` is optional and selects the visual style.

Fetched directly from the live docs page on 2026-07-05; no synthetic content added.
