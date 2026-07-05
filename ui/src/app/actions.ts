"use server";

import { appendDecision, type Decision } from "@/lib/flags";

// The one place anything actually executes: recording a human's approve/
// reject click (with whatever edited proposed_action text they left in the
// note) to output/decisions.json. Nothing upstream of this auto-runs.
export async function recordDecision(
  id: string,
  decision: Decision["decision"],
  note: string
): Promise<Decision> {
  const entry: Decision = {
    id,
    decision,
    note,
    decided_at: new Date().toISOString(),
  };
  await appendDecision(entry);
  return entry;
}
