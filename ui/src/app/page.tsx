import { ApprovalQueue } from "@/components/approval-queue";
import { applyDecisions, loadDecisions, loadFlagsFile } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [flagsFile, decisions] = await Promise.all([loadFlagsFile(), loadDecisions()]);
  const flags = applyDecisions(flagsFile.flags, decisions);
  const pendingCount = flags.filter((f) => f.status === "pending").length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1>
          <p className="text-sm text-muted-foreground">{flagsFile.governance_note}</p>
          <p className="text-xs text-muted-foreground">
            {flagsFile.source_count} sources scanned · {flagsFile.flag_count} flags ·{" "}
            {pendingCount} pending review · generated{" "}
            {new Date(flagsFile.generated_at).toLocaleString()}
          </p>
        </header>
        <ApprovalQueue flags={flags} />
      </main>
    </div>
  );
}
