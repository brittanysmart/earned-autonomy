"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Flag, Source } from "@/lib/flags";
import { recordDecision } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { GuidedQueue } from "@/components/plumb/guided-queue";
import { ListQueue } from "@/components/plumb/list-queue";
import { SourcesScreen } from "@/components/plumb/sources-screen";

type Screen = "start" | "queue" | "sources";
type Mode = "guided" | "list";

function NavLink({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function PlumbLogo({ className }: { className?: string }) {
  // A budding sprout: plum bloom, sage leaf. Fills use the brand vars so the
  // mark re-tints in dark mode instead of staying a fixed light-mode color.
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="32" cy="8" r="3.4" stroke="currentColor" strokeWidth="2.8" />
      <path d="M32 11.4 V27" stroke="currentColor" strokeWidth="2.8" />
      <path
        d="M32 27 C18 27 13 40 19 50 C23 56 32 59 32 59 C32 59 41 56 45 50 C51 40 46 27 32 27 Z"
        fill="var(--plum)"
      />
      <path d="M33 27 C40 19 49 21 47 27 C45 32 37 32 33 27 Z" fill="var(--sage)" />
    </svg>
  );
}

export function PlumbApp({
  sources,
  flags: initialFlags,
  governanceNote,
}: {
  sources: Source[];
  flags: Flag[];
  governanceNote: string;
}) {
  const [screen, setScreen] = useState<Screen>("start");
  const [mode, setMode] = useState<Mode>("guided");
  const [flags, setFlags] = useState(initialFlags);

  const pendingCount = flags.filter((f) => f.status === "pending").length;
  const sourceOfTruth = useMemo(
    () => sources.find((s) => s.authority === "official")?.source ?? null,
    [sources],
  );

  async function handleDecide(
    id: string,
    decision: "approved" | "rejected",
    note: string,
  ): Promise<string> {
    const entry = await recordDecision(id, decision, note);
    setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, status: entry.decision } : f)));
    return entry.decided_at;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-3">
          <button
            onClick={() => setScreen("start")}
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <PlumbLogo className="size-6 text-foreground" />
            Plumb
          </button>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Demo
          </span>
          {screen !== "start" && (
            <nav className="ml-auto flex items-center gap-1">
              <NavLink label="Review queue" active={screen === "queue"} onClick={() => setScreen("queue")} />
              <NavLink label="Sources" active={screen === "sources"} onClick={() => setScreen("sources")} />
            </nav>
          )}
        </div>
      </header>

      <main className="flex-1">
        {screen === "start" && (
          <StartScreen
            count={pendingCount}
            onStart={(m) => {
              setMode(m);
              setScreen("queue");
            }}
          />
        )}

        {screen === "queue" &&
          (mode === "guided" ? (
            <GuidedQueue
              flags={flags}
              sourceOfTruth={sourceOfTruth}
              onDecide={handleDecide}
              onSeeAll={() => setMode("list")}
            />
          ) : (
            <ListQueue flags={flags} sourceOfTruth={sourceOfTruth} onDecide={handleDecide} />
          ))}

        {screen === "sources" && <SourcesScreen sources={sources} />}
      </main>

      <footer className="border-t border-border bg-card/60 px-6 py-6">
        <p className="mx-auto max-w-5xl text-xs leading-relaxed text-muted-foreground">
          {governanceNote}{" "}
          Scoring is a real local model call (Ollama, tool use). The model rates
          its own confidence, but it doesn&apos;t decide what counts as confident enough to skip
          review, that rule is hardcoded in <code className="font-mono">audit.py</code>. Grading
          your own homework only works if someone else still checks it.
        </p>
      </footer>
    </div>
  );
}

function StartScreen({
  count,
  onStart,
}: {
  count: number;
  onStart: (mode: Mode) => void;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-8 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent">
        <PlumbLogo className="size-8 text-foreground" />
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        Plumb, pronounced &ldquo;plum,&rdquo; like the fruit.
      </p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight">
        You&apos;ve got {count} {count === 1 ? "change" : "changes"} to review.
      </h1>
      <p className="mt-3.5 text-[15px] leading-relaxed text-muted-foreground">
        Plumb compared your Badge docs against the official source and found a few that have
        drifted out of date. It wants to fix them, but it won&apos;t change anything until you say
        yes. You can go through them one at a time, or see them all at once.
      </p>
      <Button size="lg" className="mt-7" onClick={() => onStart("guided")}>
        Start reviewing
      </Button>
      <button
        onClick={() => onStart("list")}
        className="mt-3.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        or see all {count} at once
      </button>
    </div>
  );
}
