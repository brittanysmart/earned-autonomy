---
source: shadcn.rails-components.com/docs/components/badge
authority: unofficial_port
last_fetched: 2026-07-04
---

# Badge (Rails port)

<%= render_badge text: "Badge" %>
<%= render_badge text: "Secondary", variant: :secondary %>
<%= render_badge text: "Destructive", variant: :destructive %>
<%= render_badge text: "Outline", variant: :outline %>
<%= render_badge text: "Ghost", variant: :ghost %>

The method render_badge accepts a text: required keyword argument along with an optional
variant: argument for the kind of badge to render.

Note: this port lists five variants including "ghost" — but the official shadcn/ui docs
define exactly four Badge variants (default, secondary, destructive, outline) and no "ghost"
variant exists for Badge in the official registry. This is an unsourced terminology/taxonomy
substitution: a port has added a variant the source of truth never shipped, likely borrowed
by analogy from the Button component's variant set, which does include "ghost."

No API reference table (prop/type/default) is present on this page.
