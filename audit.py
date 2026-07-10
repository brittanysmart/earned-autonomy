#!/usr/bin/env python3
"""
Design System Knowledge Audit — agent core.

Reads real snapshot docs for shadcn/ui components (official + unofficial mirrors) and asks
a local model to score each source against four governance criteria (judgment boundaries,
terminology consistency, staleness/drift, retrievability), emitting proposed flags in the
exact shape the Approval Queue UI consumes.

This is intentionally NOT auto-publishing anything. Every flag below is a *proposed* action
with a model-stated confidence and reasoning. The 90%-confidence human-review threshold is a
hardcoded policy in this file, not something the model controls — that split (model judges
the finding, code enforces the review policy) is the actual governance mechanism this
project demonstrates.
"""

import re
import json
import glob
from pathlib import Path
from datetime import datetime, timezone

import litellm

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "output"

MODEL = "ollama/qwen2.5:7b"
API_BASE = "http://localhost:11434"
MAX_TOKENS = 1024

# Governance policy, enforced in code rather than left to the model: any flag the
# model rates below this confidence is always surfaced for human review. The model
# judges the finding; this threshold decides what counts as sure enough to skip a
# human, and the model can't move it. A convincing answer isn't a correct one.
REVIEW_THRESHOLD = 90

# Curated, on purpose: flags the model produced that a human knows are wrong, kept
# in the demo and labeled rather than hidden. A queue that never shows its own
# misses trains reviewers to rubber-stamp — precision matters more than recall in a
# human-in-the-loop system, because the scarce resource is reviewer attention. Keyed
# by the deterministic flag id (component-source-criterion). Confirm designations
# against a fresh run before trusting them; the model's output can shift.
KNOWN_FALSE_POSITIVES = {
    "badge-shadcn.io/ui/badge-terminology_consistency": (
        "False alarm, kept on purpose. This flag says the \"default\" variant doesn't "
        "match the official \"default\" variant. Same name. What tripped the scorer is "
        "that the mirror writes a short description after the name (\"default – primary "
        "information and active states\"), and it compared that whole line to the bare "
        "official name. It flagged a variant that was never wrong. Real finding, real "
        "miss, kept visible because a queue that hides its own mistakes teaches you to "
        "stop reading the evidence."
    ),
}

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)

CRITERIA = {
    "judgment_boundaries": (
        "Does this doc explain WHEN and WHY to use (or not use) this component, not just "
        "install/API syntax? Flag official docs missing this guidance entirely. Flag "
        "unofficial sources that uniquely provide real judgment guidance the official docs "
        "lack."
    ),
    "terminology_consistency": (
        "Does this doc's terminology (variant names, prop names) match the official "
        "shadcn/ui vocabulary? Flag any variant or prop that is missing relative to the "
        "official set, or that doesn't match official naming."
    ),
    "staleness_drift": (
        "Is there any indication this doc reflects the current state of the component? "
        "Flag the absence of a 'last updated', version, or changelog signal — especially "
        "for unofficial sources."
    ),
    "retrievability": (
        "Does this doc include a structured prop/type/default API reference table an "
        "automated tool could reliably parse? Flag its absence."
    ),
}

SYSTEM_PROMPT = (
    "You are auditing documentation sources for a design system component, one source at a "
    "time. You will be given metadata about the source (which component, whether it's the "
    "official docs or an unofficial mirror/port, and the source URL) and the document's "
    "full text.\n\n"
    "Evaluate the document against these four criteria:\n\n"
    + "\n".join(f"- {key}: {desc}" for key, desc in CRITERIA.items())
    + "\n\nFor each criterion where you find a genuine, specific issue, call propose_flag "
    "exactly once. Do NOT call propose_flag for a criterion with no real finding — silence "
    "is a valid outcome. Ground every finding in a direct quote or specific detail from the "
    "document, not a generic assumption. State your own confidence (0-100) in how correct "
    "and specific the finding is.\n\n"
    "For every flag also provide: 'plain' — the fix in one jargon-free sentence a non-expert "
    "could act on; and the exact edit as 'patch_before' (text copied verbatim from the "
    "document that changes, or empty if you are only adding) and 'patch_after' (the exact new "
    "text). The patch must be a real, specific edit to THIS document's text, not a vague "
    "instruction."
)

PROPOSE_FLAG_TOOL = {
    "type": "function",
    "function": {
        "name": "propose_flag",
        "description": "Propose a single governance flag for one issue found in this document.",
        "parameters": {
            "type": "object",
            "properties": {
                "criterion": {"type": "string", "enum": list(CRITERIA.keys())},
                "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                "confidence": {
                    "type": "integer",
                    "description": (
                        "0-100: how confident you are this finding is correct and specific "
                        "to this document."
                    ),
                },
                "summary": {
                    "type": "string",
                    "description": "One plain-English sentence describing the issue, naming the component.",
                },
                "evidence": {
                    "type": "string",
                    "description": (
                        "A complete quoted sentence or phrase from the document supporting "
                        "this finding. Must be a full thought, never cut off mid-word or "
                        "mid-quote."
                    ),
                },
                "proposed_action": {
                    "type": "string",
                    "description": "One concrete, actionable recommendation to address the finding.",
                },
                "plain": {
                    "type": "string",
                    "description": (
                        "The same fix restated in one plain sentence a non-expert could act "
                        "on, no jargon. This is what a reviewer reads first."
                    ),
                },
                "patch_before": {
                    "type": "string",
                    "description": (
                        "The exact text copied verbatim from the document that your fix "
                        "would change. Empty string if the fix only ADDS new text with "
                        "nothing to replace."
                    ),
                },
                "patch_after": {
                    "type": "string",
                    "description": (
                        "The exact replacement text, or the new text to add. This is the "
                        "concrete edit Plumb would write into the source."
                    ),
                },
            },
            "required": [
                "criterion", "severity", "confidence", "summary", "evidence", "proposed_action",
                "plain", "patch_before", "patch_after",
            ],
        },
    },
}


def parse_file(path: Path):
    text = path.read_text()
    m = FRONTMATTER_RE.match(text)
    meta, body = {}, text
    if m:
        raw_meta, body = m.group(1), m.group(2)
        for line in raw_meta.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
    # filename pattern: component__role__domain.md
    stem = path.stem
    parts = stem.split("__")
    component = parts[0]
    role = parts[1] if len(parts) > 1 else "unknown"
    return {
        "component": component,
        "role": role,  # 'official' or 'mirror-<name>'
        "meta": meta,
        "body": body,
        "path": str(path),
    }


def load_all():
    files = sorted(glob.glob(str(DATA_DIR / "*.md")))
    return [parse_file(Path(f)) for f in files]


def clamp_confidence(raw):
    """Pin model-reported confidence to [0, 100]; tool-call output isn't guaranteed in range."""
    return max(0, min(100, raw))


def requires_human_review(confidence):
    """Governance rule: below REVIEW_THRESHOLD, always surface for a human.

    Deliberately a plain comparison the model can't influence — the whole point of the
    project is that this policy lives in code, not in the model's own judgment of itself.
    """
    return confidence < REVIEW_THRESHOLD


def score_doc(doc, official_reference=None):
    """Ask the model to evaluate one doc against the four criteria, returning proposed flags.

    official_reference (the official doc's own body) is passed in when scoring a non-official
    doc, so terminology_consistency is checked against real current official content instead
    of the model's own (possibly stale) training knowledge of shadcn/ui's API.
    """
    if doc["role"] == "official":
        reference_note = (
            "This document IS the official source. Do not evaluate terminology_consistency "
            "against it — there is nothing external to compare it to."
        )
    elif official_reference:
        reference_note = (
            "For terminology_consistency, compare this document's variant/prop names against "
            "the CURRENT OFFICIAL documentation below — not your own prior knowledge, which "
            "may be out of date:\n\n--- OFFICIAL REFERENCE ---\n"
            f"{official_reference}\n--- END OFFICIAL REFERENCE ---"
        )
    else:
        reference_note = (
            "No official reference document was available for this run — treat any "
            "terminology_consistency finding as low confidence."
        )

    user_prompt = (
        f"Component: {doc['component']}\n"
        f"Source role: {doc['role']} (official = the design system's own docs; "
        "unofficial_mirror/unofficial_port = a third-party copy)\n"
        f"Source URL: {doc['meta'].get('source', 'unknown')}\n\n"
        f"{reference_note}\n\n"
        f"Document text:\n{doc['body']}"
    )

    try:
        response = litellm.completion(
            model=MODEL,
            api_base=API_BASE,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            tools=[PROPOSE_FLAG_TOOL],
            temperature=0,  # this is structured extraction, not creative chat — minimize
            # run-to-run variance in whether the model follows the reference/self-comparison
            # instructions above.
            max_tokens=MAX_TOKENS,  # rule out token-budget truncation cutting a tool-call
            # argument short mid-sentence, separate from the model choosing a short (but
            # complete) answer on its own.
        )
    except Exception as e:
        print(
            f"Skipping {doc['meta'].get('source', doc['path'])}: model call failed ({e}). "
            "Is Ollama running? Try: brew services start ollama"
        )
        return []

    if response.choices[0].finish_reason == "length":
        # max_tokens is a single budget shared across every propose_flag call the model
        # makes in this response — if it hit the cap, the last tool call may be cut off
        # mid-argument and silently dropped below as malformed JSON. Say so out loud
        # instead of that looking identical to "the model found nothing here."
        print(
            f"Warning: {doc['meta'].get('source', doc['path'])} hit the {MAX_TOKENS}-token "
            "response limit — some findings may be missing or truncated."
        )

    flags = []
    seen_criteria = set()  # the model is told to call propose_flag once per criterion, but
    # nothing stops it calling twice — enforce that contract here too, since a duplicate id
    # would otherwise collide as a React key in the Approval Queue UI.
    tool_calls = response.choices[0].message.tool_calls or []
    for call in tool_calls:
        try:
            args = json.loads(call.function.arguments)
            criterion = args["criterion"]
            severity = args["severity"]
            confidence = int(round(float(args["confidence"])))
            summary = args["summary"]
            evidence = args["evidence"]
            proposed_action = args["proposed_action"]
            # plain/patch are newer, lower-stakes fields — tolerate a model that
            # omits them rather than dropping an otherwise-valid flag over it.
            plain = args.get("plain", "") or proposed_action
            patch_before = args.get("patch_before", "")
            patch_after = args.get("patch_after", "")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue  # malformed tool call from the model — skip rather than guess

        if criterion not in CRITERIA or severity not in ("low", "medium", "high"):
            continue  # model output outside the contract — skip rather than guess

        if criterion == "terminology_consistency" and doc["role"] == "official":
            # Structurally meaningless (the official doc can't be inconsistent with itself)
            # and the model doesn't reliably follow the prompt instruction not to do this —
            # enforce it here in code instead of trusting compliance.
            continue

        if criterion in seen_criteria:
            continue  # duplicate call for a criterion already flagged on this doc
        seen_criteria.add(criterion)

        confidence = clamp_confidence(confidence)
        source = doc["meta"].get("source", "unknown")
        flag_id = f"{doc['component']}-{source}-{criterion}"
        fp_note = KNOWN_FALSE_POSITIVES.get(flag_id)
        flags.append({
            "id": flag_id,
            "component": doc["component"],
            "source": source,
            "criterion": criterion,
            "severity": severity,
            "confidence": confidence,
            "summary": summary,
            "evidence": evidence,
            "proposed_action": proposed_action,
            "plain": plain,
            # The concrete edit the reviewer approves, shown as a diff in the UI.
            # before="" means a pure addition; file is the source it lands in.
            "patch": {
                "file": source,
                "before": patch_before,
                "after": patch_after,
            },
            # Governance rule lives in requires_human_review(), not here — the model rates
            # its own confidence, but code alone decides what counts as sure enough to skip
            # a human. A convincing answer isn't the same as a correct one. (Solaris, 1972.)
            "requires_human_review": requires_human_review(confidence),
            "false_positive": fp_note is not None,
            "false_positive_note": fp_note or "",
            "illustrative": False,
            "illustrative_note": "",
            "status": "pending",  # pending | approved | rejected — set via the queue UI
        })
    return flags


# One authored high-severity flag, appended and labeled as authored in the UI. The
# real model didn't produce a high-severity finding on these docs this run, so the
# blast-radius behavior (a high-risk change stays with a human at any autonomy
# setting and needs a deliberate confirmation) would otherwise have nothing to
# demonstrate. Everything about the decision flow is real; only this flag's content
# is hand-written, and the UI says so on the card.
DEMO_HIGH_FLAG = {
    "id": "badge-DEMO-judgment_boundaries-high",
    "component": "badge",
    "source": "ui.shadcn.com/docs/components/badge",
    "criterion": "judgment_boundaries",
    "severity": "high",
    "confidence": 68,
    "summary": "An example renders Badge as a clickable control, but Badge is non-interactive.",
    "evidence": (
        "The docs show Badge used inside an interactive pattern without stating that "
        "Badge is presentational. A reader could ship it as a button and break keyboard "
        "and screen-reader access for every consumer who copies the example."
    ),
    "proposed_action": (
        "Add a 'When not to use' note: Badge is non-interactive; for a clickable state "
        "use Button. Update any example that implies otherwise."
    ),
    "plain": "Say plainly that Badge isn't clickable, and point people to Button when they need that.",
    "patch": {
        "file": "ui.shadcn.com/docs/components/badge",
        "before": "",
        "after": (
            "## When not to use\n\n"
            "Badge is non-interactive. For a clickable state, use a `Button`."
        ),
    },
    "requires_human_review": True,
    "false_positive": False,
    "false_positive_note": "",
    "illustrative": True,
    "illustrative_note": (
        "Authored, not from the model. The three flags above came from a local model "
        "reading the actual docs; that run produced no high-severity finding, so this "
        "one is hand-written to show how Plumb treats a high-blast-radius change. A "
        "high-severity flag stays with a human at any autonomy setting and needs a "
        "deliberate confirmation to approve. Only this flag's wording is authored; the "
        "decision flow around it is the real thing."
    ),
    "status": "pending",
}


def run():
    docs = load_all()
    # Picks the first official doc across the whole corpus, not per-component — fine while
    # data/ holds a single component (a deliberate scope decision, see CONTEXT.md), but this
    # would need to key official_reference by component before a second component is added.
    official_doc = next((d for d in docs if d["role"] == "official"), None)
    official_reference = official_doc["body"] if official_doc else None

    all_flags = []
    for doc in docs:
        all_flags.extend(score_doc(doc, official_reference=official_reference))

    # One row per declared source, so the UI can show the authority hierarchy as
    # data (who outranks whom, who owns it) rather than tribal knowledge — that
    # ownership model is the governance point, see approval-queue-brief.md.
    flags_by_source = {}
    for f in all_flags:
        flags_by_source[f["source"]] = flags_by_source.get(f["source"], 0) + 1
    sources = [
        {
            "source": d["meta"].get("source", "unknown"),
            "authority": d["meta"].get("authority", "unknown"),
            "last_fetched": d["meta"].get("last_fetched", "unknown"),
            "owner": d["meta"].get("owner", "No owner declared"),
            "role": d["role"],
            "flag_count": flags_by_source.get(d["meta"].get("source", "unknown"), 0),
        }
        for d in docs
    ]

    # Appended after the source tally so the Sources screen's per-source counts
    # reflect only real model findings, not the authored demo flag.
    all_flags.append(DEMO_HIGH_FLAG)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(docs),
        "flag_count": len(all_flags),
        "governance_note": "Every flag Plumb raises is something it noticed, not something it did. Confidence under 90 means a human has to look. No exceptions.",
        "sources": sources,
        "flags": all_flags,
    }

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / "flags.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Wrote {len(all_flags)} flags from {len(docs)} sources to {out_path}")
    return out


if __name__ == "__main__":
    run()
