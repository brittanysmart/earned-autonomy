---
source: ui.shadcn.com/docs/components/badge
authority: official
last_fetched: 2026-07-05
---

# Badge

Displays a badge or a component that looks like a badge. Available in both Base UI and
Radix UI variants.

## Installation
pnpm dlx shadcn@latest add badge

## Usage
```
import { Badge } from "@/components/ui/badge"

<Badge variant="default | outline | secondary | destructive">Badge</Badge>
```

## Variants
- default
- secondary
- destructive
- outline
- ghost
- link

## Implementation Patterns
- With Icons: use `data-icon="inline-start"` or `data-icon="inline-end"` to position an icon
- With Spinners: same data-attribute pattern as icons
- As Links: the `render` prop enables badge-styled link rendering
- Custom Colors: apply Tailwind classes directly (e.g. `bg-green-50 dark:bg-green-800`)
- RTL: see the RTL configuration guide

## API Reference
| Prop | Type | Default |
|------|------|---------|
| variant | "default" \| "secondary" \| "destructive" \| "outline" \| "ghost" \| "link" | "default" |
| className | string | — |

Fetched directly from the live docs page on 2026-07-05; no synthetic content added.
