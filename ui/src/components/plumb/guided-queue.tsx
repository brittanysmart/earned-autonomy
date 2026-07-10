"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Sprout } from "lucide-react";
import type { Flag } from "@/lib/flags";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FlagCard } from "@/components/plumb/flag-card";

export function GuidedQueue({
  flags,
  sourceOfTruth,
  onDecide,
  onSeeAll,
}: {
  flags: Flag[];
  sourceOfTruth: string | null;
  onDecide: (id: string, decision: "approved" | "rejected", note: string) => Promise<string>;
  onSeeAll: () => void;
}) {
  const [index, setIndex] = useState(0);

  const resolvedCount = useMemo(
    () => flags.filter((f) => f.status !== "pending").length,
    [flags],
  );
  const approved = flags.filter((f) => f.status === "approved").length;
  const skipped = flags.filter((f) => f.status === "rejected").length;
  const total = flags.length;
  // "done" covers both an all-decided queue and one that was empty to begin
  // with (a model run can legitimately find nothing) — either way there's no
  // card to show, and current below must never index an empty array.
  const allDone = resolvedCount === total;

  function move(dir: 1 | -1) {
    setIndex((i) => Math.min(total - 1, Math.max(0, i + dir)));
  }

  const current = flags[Math.min(index, total - 1)];

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <div className="mb-6 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {resolvedCount} of {total} reviewed
          </span>
          <button onClick={onSeeAll} className="underline underline-offset-2 hover:text-foreground">
            See all at once
          </button>
        </div>
        <Progress
          aria-label="Review progress"
          value={total ? (resolvedCount / total) * 100 : 0}
          trackClassName="bg-foreground/10"
          indicatorStyle={{ background: "var(--primary)" }}
        />
      </div>

      {allDone ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent">
            <Sprout className="size-7 text-plum" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">All done.</h2>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            You reviewed everything. {approved} approved, {skipped} skipped. For the ones you
            approved, this demo shows the pull request Plumb would open. Your team merges from
            there.
          </p>
          <Button onClick={onSeeAll} className="mt-6">
            See everything
          </Button>
        </div>
      ) : (
        <>
          <FlagCard
            key={current.id}
            flag={current}
            index={index}
            total={total}
            sourceOfTruth={sourceOfTruth}
            onDecide={onDecide}
            onFocusMove={move}
            autofocus
          />

          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={index === 0}
              onClick={() => move(-1)}
              className="gap-1.5 text-muted-foreground"
            >
              <ArrowLeft className="size-4" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Use ← → to move between flags
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={index >= total - 1}
              onClick={() => move(1)}
              className="gap-1.5 text-muted-foreground"
            >
              Next <ArrowRight className="size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
