import flagsFile from "@/data/flags.json";

export type Severity = "low" | "medium" | "high";
export type DecisionStatus = "pending" | "approved" | "rejected";

// The concrete edit a reviewer approves, rendered as a diff. before="" means a
// pure addition (nothing to replace); file is the source doc it lands in.
export type Patch = {
  file: string;
  before: string;
  after: string;
};

export type Flag = {
  id: string;
  component: string;
  source: string;
  criterion: string;
  severity: Severity;
  confidence: number;
  summary: string;
  evidence: string;
  proposed_action: string;
  plain: string;
  patch: Patch;
  requires_human_review: boolean;
  false_positive: boolean;
  false_positive_note: string;
  illustrative: boolean;
  illustrative_note: string;
  status: DecisionStatus;
};

export type Source = {
  source: string;
  authority: string;
  last_fetched: string;
  owner: string;
  role: string;
  flag_count: number;
};

export type FlagsFile = {
  generated_at: string;
  source_count: number;
  flag_count: number;
  governance_note: string;
  sources: Source[];
  flags: Flag[];
};

// audit.py writes output/flags.json at the repo root; `npm run sync-flags`
// copies it here. The UI imports it rather than reading it off disk, because
// the deployed app's root is `ui/` and the repo root isn't in the bundle.
export function loadFlagsFile(): FlagsFile {
  return flagsFile as FlagsFile;
}
