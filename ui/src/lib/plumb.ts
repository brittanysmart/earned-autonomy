import type { Flag, Severity } from "@/lib/flags";

// Plain-English label for each criterion; the underlying names are script-internal
// category names a reader hasn't seen. The technical name rides along in the title.
export const CRITERION_LABEL: Record<string, { label: string; title: string }> = {
  judgment_boundaries: {
    label: "Missing usage guidance",
    title:
      "judgment_boundaries: this source doesn't say when to use (or not use) the component",
  },
  terminology_consistency: {
    label: "Naming mismatch",
    title:
      "terminology_consistency: this source uses different terms/variants than the official docs",
  },
  staleness_drift: {
    label: "Might be outdated",
    title: "staleness_drift: no date or version marker found to confirm this is current",
  },
  retrievability: {
    label: "Missing API reference",
    title: "retrievability: no prop/type/default table found, hard for a tool to extract",
  },
};

export function criterionInfo(criterion: string) {
  return (
    CRITERION_LABEL[criterion] ?? {
      label: criterion.replaceAll("_", " "),
      title: criterion,
    }
  );
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low severity",
  medium: "Medium severity",
  high: "High severity",
};

// Severity is blast radius (harm if wrong), confidence is certainty — two axes.
// Friction on approval tracks blast radius, not certainty: a high-severity change
// gets a deliberate confirm gesture even at high confidence, a low one goes through
// on a single click. This is the whole "autonomy earned per-action" thesis made
// tactile at the point of the click.
export type FrictionLevel = "click" | "confirm" | "deliberate";

export function frictionFor(flag: Flag): FrictionLevel {
  if (flag.severity === "high") return "deliberate"; // stays with a human at any setting
  if (flag.requires_human_review) return "confirm"; // model itself wasn't sure
  return "click";
}

export function confidenceTone(confidence: number): {
  label: string;
  className: string;
} {
  if (confidence >= 85)
    return { label: "High confidence", className: "text-primary" };
  if (confidence >= 60)
    return { label: "Medium confidence", className: "text-caution" };
  return { label: "Low confidence", className: "text-muted-foreground" };
}

// Whether a flag would run on its own at a given auto-approve line. High-severity
// changes never auto-run regardless of the slider — blast radius overrides the
// number. Nothing actually executes here either way; this only previews which
// side of the policy line a flag falls on so a reviewer can feel the trade-off.
export function runsOnItsOwn(flag: Flag, threshold: number): boolean {
  return flag.severity !== "high" && flag.confidence >= threshold;
}

export type DiffLine = { kind: "ctx" | "add" | "rem"; text: string };

// Turn a before/after patch into renderable diff lines. before="" is a pure
// addition (every line is added); otherwise before lines are removed and after
// lines added — a whole-block replacement, which is all the model's edits are.
export function diffLines(before: string, after: string): DiffLine[] {
  const lines: DiffLine[] = [];
  if (before.trim()) {
    for (const l of before.split("\n")) lines.push({ kind: "rem", text: l });
  }
  for (const l of after.split("\n")) lines.push({ kind: "add", text: l });
  return lines;
}

// The authority hierarchy as data — the ranking, not tribal knowledge. Lower
// rank number outranks: official is the source of truth everything else is
// measured against.
export const AUTHORITY_META: Record<
  string,
  { label: string; rank: number }
> = {
  official: { label: "Source of truth", rank: 1 },
  unofficial_mirror: { label: "Community mirror", rank: 2 },
  unofficial_port: { label: "Community port", rank: 3 },
};

export function authorityInfo(authority: string) {
  return AUTHORITY_META[authority] ?? { label: authority.replaceAll("_", " "), rank: 99 };
}
