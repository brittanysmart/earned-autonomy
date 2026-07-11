# Plumb: designing the moment a human decides whether to trust an agent

![Plumb's review queue: a confidence-and-severity triage with a policy slider that sets the auto-approve line](plumb-hero.png)

## The one-line version

As AI agents start doing real work, the hard part is not getting them to act. It is the moment a human decides whether to let them. I built the approval layer for that moment, and demonstrated it on a documentation agent.

## The problem I actually lived

At the design systems company where I spent four years, our component documentation lived in two places at once: Storybook for the code, Figma for the design. Nothing declared which one outranked the other, so "official" was tribal knowledge. Designers could not update Storybook. Developers did not update Figma. Components changed without anyone updating the docs, and the drift was always discovered downstream, by whoever needed the information most and trusted it least.

That is a governance failure, not a tooling failure. The sync tools worked fine. What no tool answered was the real question: when something changes, who is responsible for deciding what to do about it?

I kept thinking about that question as AI agents started editing codebases. An agent changing a component without review is the same failure I watched for four years, just with a faster actor. A human still has to decide whether to trust the change, and that decision is a design surface almost nobody designs.

## Why the existing tools stop short

I researched the landscape before building anything. storysync reads tokens and pushes them to Figma variables. ui-drift scans React for hardcoded values and scores health. Figma Code Connect opens a pull request when a variable changes. Each handles the mechanics of synchronization well.

None of them decide. They all output a report, and a report is stateless: it tells you what changed and then it is your problem. A queue has state (pending, approved, rejected), and state is what makes a change reviewable instead of merely visible. That gap, who owns the decision, is the governance layer teams skip, because no tool builds it for them.

## What I built

Plumb scans real documentation for shadcn/ui's Badge component and flags problems: a missing "when not to use" note, a variant name that drifted from the official source, a doc with no freshness signal. Each flag is a proposal, not an action. A local model reads each doc and rates its own confidence. Nothing is published or changed automatically.

Two decisions carry the whole thesis.

**The model does not decide what counts as sure enough to skip a human.** That rule lives in one hardcoded line: below 90 percent confidence, a person always reviews. The model judges the finding, the code enforces the policy, and the model cannot move the line. A convincing answer is not the same as a correct one, and the only way to keep that honest is to put the threshold where the model cannot touch it.

**Authority is data, not tribal knowledge.** Every source declares who it is and who owns it, so drift is measured against a real source of truth instead of a guess. That is also where the name comes from: a plumb bob is the weighted string that shows true vertical, and Plumb measures each source against true.

The reviewer works in whichever mode fits the moment: one flag at a time when the stakes are high, or an all-at-once triage with a slider that previews where the auto-approve line falls. Friction scales with blast radius. A high-severity change asks for a deliberate confirmation even when the model is confident, because visual weight should track how much harm a wrong call does, not how certain the model feels.

## What went wrong, on purpose

One flag in the demo is wrong, and I left it there, labeled. The model flagged a variant called "default" as not matching the official "default." Same name. It had read the human-readable description sitting next to the name as if the name itself had changed.

I kept it because a queue that hides its own mistakes is worse than one that shows them. A reviewer who never sees a false positive learns to trust every flag, and a reviewer who trusts every flag is a rubber stamp, which destroys the exact governance layer the tool exists to provide. Precision matters more than recall in a human-in-the-loop system, because the scarce resource is reviewer attention, not detection.

## What I would build next

Real execution: approving a flag currently shows the pull request it would open, and the next step is opening it for real. A live source through the Figma or storysync APIs instead of saved snapshots. What I deliberately did not build is notifications, because routing is downstream of ownership. You cannot tell the right person until you have decided who owns the decision, and deciding that is the whole point.

---

*Built with Next.js, shadcn/ui, and a local model (Ollama running qwen2.5 through LiteLLM). Code: github.com/brittanysmart/earned-autonomy*
