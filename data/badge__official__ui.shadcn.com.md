---
source: ui.shadcn.com/docs/components/radix/badge
authority: official
last_fetched: 2026-07-04
---

# Badge

Displays a badge or a component that looks like a badge.

## Installation
pnpm dlx shadcn@latest add badge

## Usage
<Badge variant="default | outline | secondary | destructive">Badge</Badge>

Use the variant prop to change the variant of the badge.

## Examples
With Icon, With Spinner, Link (asChild), Custom Colors, RTL — all shown as code examples.

## API Reference
| Prop | Type | Default |
|------|------|---------|
| variant | "default" \| "secondary" \| "destructive" \| "outline" | "default" |
| asChild | boolean | false |

Official variant set is exactly four values: default, secondary, destructive, outline.
No "when to use which variant" guidance exists on this page. No rule on text length,
notification-count formatting, or color-to-meaning mapping (e.g. does destructive always
mean "error," or can it mean other things). The page is purely install + code + API surface.
