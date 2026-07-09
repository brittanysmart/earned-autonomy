import { ApprovalQueue } from "@/components/approval-queue";
import { applyDecisions, loadDecisions, loadFlagsFile } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [flagsFile, decisions] = await Promise.all([loadFlagsFile(), loadDecisions()]);
  const flags = applyDecisions(flagsFile.flags, decisions);

  return (
    <div className="flex min-h-screen flex-col bg-background">
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
                {flagsFile.source_count} sources scanned, generated{" "}
                {new Date(flagsFile.generated_at).toLocaleString()}. Each card is something the
                model noticed. Hover any label for a plain-English explanation.
              </p>
              <p>
                The three &quot;badge&quot; sources below are real content fetched from the live
                official docs and two unofficial mirrors, not staged fixtures. See{" "}
                <code className="font-mono">data/*.md</code> for the snapshots. Every flag below
                came from a local model actually reasoning about that text, not a scripted match.
              </p>
              <p>
                Keyboard: focus a card, then <code className="font-mono">A</code> approve,{" "}
                <code className="font-mono">R</code> reject, <code className="font-mono">E</code>{" "}
                edit, <code className="font-mono">S</code> snooze,{" "}
                <code className="font-mono">J</code>/<code className="font-mono">K</code> move
                between cards.
              </p>
            </div>
          </details>
        </header>
        <ApprovalQueue flags={flags} />
      </main>
      <footer className="border-t bg-card px-6 py-6">
        <p className="mx-auto max-w-3xl text-xs text-muted-foreground">
          Scoring is a real local model call (Ollama, tool use). It rates its own confidence, but
          it doesn&apos;t get to decide what counts as confident enough to skip review. That rule
          is hardcoded in <code className="font-mono">audit.py</code>, not something the model
          controls. Grading your own homework only works if someone else still checks it.
        </p>
      </footer>
    </div>
  );
}
