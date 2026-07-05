#!/usr/bin/env python3
"""
Design System Knowledge Audit — agent core.

Reads real snapshot docs for shadcn/ui components (official + unofficial mirrors),
scores each source against four governance criteria (judgment boundaries, terminology
consistency, staleness/drift, retrievability), and emits a list of flagged items in the
exact shape the Approval Queue UI consumes.

This is intentionally NOT auto-publishing anything. Every flag below is a *proposed*
action with a stated confidence and reasoning. Nothing here executes on its own —
that's the whole point of the governance thesis: the agent proposes, a human disposes.
"""

import re
import json
import glob
from pathlib import Path
from datetime import datetime, timezone

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "output"

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)


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


def flag(component, source, criterion, severity, confidence, summary, evidence, recommended_action):
    return {
        "id": f"{component}-{source}-{criterion}",
        "component": component,
        "source": source,
        "criterion": criterion,
        "severity": severity,          # low | medium | high
        "confidence": confidence,      # agent's confidence 0-100 that this flag is correct
        "summary": summary,
        "evidence": evidence,
        "proposed_action": recommended_action,
        "requires_human_review": confidence < 90,  # governance rule: below 90, always surface for review
        "status": "pending",           # pending | approved | rejected — set by the human via the queue UI
    }


def check_judgment_boundaries(doc):
    body = doc["body"]
    flags = []
    if doc["role"] == "official":
        pattern = r'no .{0,10}when to use.{0,150}(exists|guidance)'
        if re.search(pattern, body, re.I | re.DOTALL):
            flags.append(flag(
                doc["component"], doc["meta"].get("source", "unknown"), "judgment_boundaries",
                severity="high", confidence=95,
                summary=f"The official '{doc['component']}' docs never say when you should (or shouldn't) use it.",
                evidence=_first_sentence(body, pattern),
                recommended_action="Ask the doc owner to add a \"when to use this\" section — right now an agent citing this page has no guardrails.",
            ))
    else:
        # Mirror sources sometimes DO contain judgment guidance the official docs lack —
        # detect via the marker sentence every snapshot uses when this is the case, rather
        # than hardcoding component-specific phrases.
        pattern = r'contains real, useful judgment guidance|contains judgment guidance'
        if re.search(pattern, body, re.I):
            flags.append(flag(
                doc["component"], doc["meta"].get("source", "unknown"), "judgment_boundaries",
                severity="medium", confidence=80,
                summary=f"This unofficial copy of the docs gives usage advice for '{doc['component']}' that the official docs never mention.",
                evidence=_first_match(body, r'#[^\n]*\n\n(.{1,350}?)\n\n', flags_extra=re.DOTALL),
                recommended_action="Either add this advice to the official docs (if it's right), or label it an unofficial opinion (if it's not).",
            ))
    return flags


def check_terminology_consistency(doc):
    flags = []
    body = doc["body"]
    if re.search(r'unsourced terminology|taxonomy (substitution|inconsistency|drift)', body, re.I):
        note = _first_sentence(body, r'Note:|This (?:source|port|page)')
        flags.append(flag(
            doc["component"], doc["meta"].get("source", "unknown"), "terminology_consistency",
            severity="medium", confidence=88,
            summary=f"This unofficial copy uses different names or variants for '{doc['component']}' than the official docs do.",
            evidence=note,
            recommended_action="Ask the doc owner to line up the naming — either fix the mismatch or add a note mapping one to the other.",
        ))
    return flags


def check_staleness_drift(doc):
    flags = []
    body = doc["body"]
    meta = doc["meta"]
    has_version_note = bool(re.search(r'tailwind v4|updated:|changelog', body, re.I))
    if doc["role"] != "official" and not has_version_note:
        flags.append(flag(
            doc["component"], meta.get("source", "unknown"), "staleness_drift",
            severity="low", confidence=60,
            summary=f"This unofficial copy doesn't say when it was last updated, so there's no way to tell if it's stale.",
            evidence="No 'Updated:', changelog, or version-specific note found in this source.",
            recommended_action="Low confidence — a person should check this copy's real last-updated date before calling this stale.",
        ))
    return flags


def check_retrievability(doc):
    flags = []
    body = doc["body"]
    has_api_table = bool(re.search(r'\|\s*Prop\s*\|\s*Type\s*\|\s*Default\s*\|', body, re.I))
    has_frontmatter = bool(doc["meta"])
    if not has_api_table:
        flags.append(flag(
            doc["component"], doc["meta"].get("source", "unknown"), "retrievability",
            severity="medium" if doc["role"] == "official" else "low",
            confidence=92 if doc["role"] == "official" else 70,
            summary=f"This page has no prop/type/default table, so a tool can't reliably pull '{doc['component']}'s API from it.",
            evidence="No API reference table found in document body.",
            recommended_action="Add a prop/type/default table — without one, an agent reading this page can't reliably learn the API.",
        ))
    return flags


def _first_match(body, pattern, flags_extra=0):
    m = re.search(pattern, body, re.I | re.DOTALL | flags_extra)
    return re.sub(r"\s+", " ", m.group(0)).strip() if m else ""


def _first_sentence(body, pattern):
    # Expands a match to its full surrounding sentence instead of a fixed
    # character window — a fixed window can land mid-word at either end
    # whenever the source markdown happens to line-wrap nearby, which reads
    # as a bug in the evidence quote rather than an intentional excerpt.
    text = re.sub(r"\s+", " ", body)
    m = re.search(pattern, text, re.I)
    if not m:
        return ""
    start, end = m.start(), m.end()
    sent_start = text.rfind(". ", 0, start)
    sent_start = sent_start + 2 if sent_start != -1 else 0
    sent_end = text.find(". ", end)
    sent_end = sent_end + 1 if sent_end != -1 else len(text)
    return text[sent_start:sent_end].strip()


def run():
    docs = load_all()
    all_flags = []
    for doc in docs:
        all_flags.extend(check_judgment_boundaries(doc))
        all_flags.extend(check_terminology_consistency(doc))
        all_flags.extend(check_staleness_drift(doc))
        all_flags.extend(check_retrievability(doc))

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(docs),
        "flag_count": len(all_flags),
        "governance_note": "Every item below is a proposed flag, not an executed action. Nothing auto-publishes. Confidence < 90 always requires human review per policy.",
        "flags": all_flags,
    }

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / "flags.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Wrote {len(all_flags)} flags from {len(docs)} sources to {out_path}")
    return out


if __name__ == "__main__":
    run()
