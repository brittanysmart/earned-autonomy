import { ApprovalQueue } from "@/components/approval-queue";
import { applyDecisions, loadDecisions, loadFlagsFile } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [flagsFile, decisions] = await Promise.all([loadFlagsFile(), loadDecisions()]);
  const flags = applyDecisions(flagsFile.flags, decisions);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <header className="mb-8 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1>
          <p className="text-sm text-muted-foreground">{flagsFile.governance_note}</p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none text-foreground/70 hover:text-foreground">
              How this demo works
            </summary>
            <div className="mt-2 space-y-2 pl-4">
              <p>
                {flagsFile.source_count} sources scanned · generated{" "}
                {new Date(flagsFile.generated_at).toLocaleString()}. Each card is one possible
                issue the scanner found — hover any label for a plain-English explanation.
              </p>
              <p>
                The three &quot;badge&quot; sources below are authored fixtures written to
                demonstrate each drift pattern (naming mismatch, stale mirror, missing API table,
                etc.), not live crawls — see <code className="font-mono">data/*.md</code> for the
                originals. The scoring logic runs the same way against real crawled docs.
              </p>
            </div>
          </details>
        </header>
        <ApprovalQueue flags={flags} />
      </main>
      <footer className="border-t bg-white px-6 py-6 dark:bg-zinc-950">
        <p className="mx-auto max-w-3xl text-xs text-muted-foreground">
          Scoring is regex/heuristic-based on purpose, not an LLM call — this keeps the logic
          inspectable and every confidence number explainable line-by-line, rather than resting on
          an opaque model judgment.
        </p>
      </footer>
    </div>
  );
}
