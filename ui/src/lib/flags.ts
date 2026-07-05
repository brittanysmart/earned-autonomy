import { promises as fs } from "fs";
import path from "path";

export type Severity = "low" | "medium" | "high";
export type DecisionStatus = "pending" | "approved" | "rejected";

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
  requires_human_review: boolean;
  status: DecisionStatus;
};

export type FlagsFile = {
  generated_at: string;
  source_count: number;
  flag_count: number;
  governance_note: string;
  flags: Flag[];
};

export type Decision = {
  id: string;
  decision: "approved" | "rejected";
  note: string;
  decided_at: string;
};

// The Next.js app lives in `ui/`; audit.py and its output live one level up
// at the repo root, so both the Python scorer and this UI read/write the
// same `output/` directory without either copying data across a boundary.
const OUTPUT_DIR = path.join(process.cwd(), "..", "output");
const FLAGS_PATH = path.join(OUTPUT_DIR, "flags.json");
const DECISIONS_PATH = path.join(OUTPUT_DIR, "decisions.json");

export async function loadFlagsFile(): Promise<FlagsFile> {
  const raw = await fs.readFile(FLAGS_PATH, "utf-8");
  return JSON.parse(raw) as FlagsFile;
}

export async function loadDecisions(): Promise<Decision[]> {
  try {
    const raw = await fs.readFile(DECISIONS_PATH, "utf-8");
    return JSON.parse(raw) as Decision[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function appendDecision(entry: Decision): Promise<void> {
  const decisions = await loadDecisions();
  decisions.push(entry);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(DECISIONS_PATH, JSON.stringify(decisions, null, 2));
}

// Latest decision per flag id wins, so re-approving/rejecting an item
// overrides its prior status while the full history stays in the log.
export function applyDecisions(flags: Flag[], decisions: Decision[]): Flag[] {
  const latest = new Map<string, Decision>();
  for (const d of decisions) latest.set(d.id, d);
  return flags.map((f) => {
    const d = latest.get(f.id);
    return d ? { ...f, status: d.decision } : f;
  });
}
