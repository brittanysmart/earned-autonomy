"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Flag, Severity } from "@/lib/flags";
import { criterionInfo, runsOnItsOwn } from "@/lib/plumb";
import { FlagCard } from "@/components/plumb/flag-card";

const SEVERITY_DOT: Record<Severity, string> = {
  high: "bg-destructive",
  medium: "bg-caution",
  low: "bg-muted-foreground",
};

function AutonomyPolicy({
  threshold,
  onChange,
  flags,
}: {
  threshold: number;
  onChange: (v: number) => void;
  flags: Flag[];
}) {
  const pending = flags.filter((f) => f.status === "pending");
  const autoEligible = pending.filter((f) => runsOnItsOwn(f, threshold)).length;
  const highRisk = pending.filter((f) => f.severity === "high").length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-foreground">
        Plumb runs on its own only when it&apos;s at least{" "}
        <span className="font-semibold text-primary tabular-nums">{threshold}%</span> sure and the
        risk is low.
      </p>
      <input
        type="range"
        min={50}
        max={100}
        step={5}
        value={threshold}
        onChange={(e) => onChange(Number(e.target.value))}
        className="plumb-slider mt-4 w-full"
        aria-label="Auto-approve confidence line"
      />
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>50% · Plumb fixes more without asking</span>
        <span>100% · Plumb always asks first</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        At this line, {autoEligible} of {pending.length} pending would run on their own.{" "}
        {highRisk > 0
          ? `${highRisk} high-risk ${highRisk === 1 ? "flag stays" : "flags stay"} with you at any setting. `
          : "High-risk flags stay with you at any setting. "}
        This previews the policy. Nothing changes without your click.
      </p>
    </div>
  );
}

export function ListQueue({
  flags,
  sourceOfTruth,
  onDecide,
}: {
  flags: Flag[];
  sourceOfTruth: string | null;
  onDecide: (id: string, decision: "approved" | "rejected", note: string) => Promise<string>;
}) {
  const [threshold, setThreshold] = useState(90);
  const [selectedId, setSelectedId] = useState<string>(flags[0]?.id ?? "");

  const selected = useMemo(
    () => flags.find((f) => f.id === selectedId) ?? flags[0],
    [flags, selectedId],
  );

  const pending = flags.filter((f) => f.status === "pending").length;
  const decided = flags.length - pending;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground tabular-nums">{pending}</span> need your
          review
        </span>
        <span aria-hidden className="text-border">·</span>
        <span>
          <span className="font-semibold text-foreground tabular-nums">{decided}</span> decided
        </span>
      </div>

      <AutonomyPolicy threshold={threshold} onChange={setThreshold} flags={flags} />

      <div className="grid gap-5 md:grid-cols-[300px_1fr]">
        {/* Left: triage list */}
        <ul className="space-y-1.5">
          {flags.map((f) => {
            const crit = criterionInfo(f.criterion);
            const isSel = f.id === selected?.id;
            return (
              <li key={f.id}>
                {/* No tooltip here on purpose: rows are for scanning/triage, and a
                    popup on every hover gets in the way. The criterion explanation
                    lives on the detail card's chip, where the decision happens. */}
                <button
                  onClick={() => setSelectedId(f.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    isSel
                      ? "border-primary/40 bg-accent/60"
                      : "border-border bg-card hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn("size-2 shrink-0 rounded-full", SEVERITY_DOT[f.severity])}
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {crit.label}
                    </span>
                    {f.status === "approved" && <Check className="ml-auto size-3.5 text-primary" />}
                    {f.status === "rejected" && (
                      <X className="ml-auto size-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 pl-4 text-xs text-muted-foreground">
                    {/* The dot's color alone can't carry severity (WCAG 1.4.1) —
                        this word is the accessible channel, the dot reinforces it. */}
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide">
                      {f.severity}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="truncate font-mono">{f.source.split("/")[0]}</span>
                    {f.false_positive && (
                      <span className="shrink-0 rounded bg-plum/10 px-1 text-[10px] font-medium text-plum">
                        may be wrong
                      </span>
                    )}
                    {f.illustrative && (
                      <span className="shrink-0 rounded bg-caution/10 px-1 text-[10px] font-medium text-caution">
                        demo
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Right: detail, stays open beside the list */}
        <div>
          {selected ? (
            <FlagCard
              key={selected.id}
              flag={selected}
              sourceOfTruth={sourceOfTruth}
              onDecide={onDecide}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Pick a flag on the left to see what Plumb found and what it wants to do.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
