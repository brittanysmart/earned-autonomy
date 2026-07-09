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
    "and specific the finding is."
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
            },
            "required": [
                "criterion", "severity", "confidence", "summary", "evidence", "proposed_action",
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
        flags.append({
            "id": f"{doc['component']}-{source}-{criterion}",
            "component": doc["component"],
            "source": source,
            "criterion": criterion,
            "severity": severity,
            "confidence": confidence,
            "summary": summary,
            "evidence": evidence,
            "proposed_action": proposed_action,
            # Governance rule lives in requires_human_review(), not here — the model rates
            # its own confidence, but code alone decides what counts as sure enough to skip
            # a human. A convincing answer isn't the same as a correct one. (Solaris, 1972.)
            "requires_human_review": requires_human_review(confidence),
            "status": "pending",  # pending | approved | rejected — set via the queue UI
        })
    return flags


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

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(docs),
        "flag_count": len(all_flags),
        "governance_note": "Every item below is something the agent noticed, not something it did. Confidence under 90 means a human has to look. No exceptions.",
        "flags": all_flags,
    }

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / "flags.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Wrote {len(all_flags)} flags from {len(docs)} sources to {out_path}")
    return out


if __name__ == "__main__":
    run()
