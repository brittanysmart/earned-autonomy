"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  Pencil,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Flag } from "@/lib/flags";
import {
  confidenceTone,
  criterionInfo,
  diffLines,
  frictionFor,
  SEVERITY_LABEL,
} from "@/lib/plumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function DiffView({ before, after, file }: { before: string; after: string; file: string }) {
  const lines = diffLines(before, after);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-muted/50">
      <div className="border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        {file}
      </div>
      <pre className="px-3 py-2 font-mono text-xs leading-relaxed">
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap",
              l.kind === "add" && "text-primary",
              l.kind === "rem" && "text-destructive line-through",
            )}
          >
            <span aria-hidden className="mr-2 inline-block w-3 select-none text-muted-foreground">
              {l.kind === "add" ? "+" : l.kind === "rem" ? "−" : " "}
            </span>
            {l.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

export function FlagCard({
  flag,
  index,
  total,
  sourceOfTruth,
  onDecide,
  onFocusMove,
  autofocus = false,
}: {
  flag: Flag;
  index?: number;
  total?: number;
  // The declared source of truth this drift is measured against, for the
  // "where this came from" context. Null when it isn't known.
  sourceOfTruth?: string | null;
  onDecide: (id: string, decision: "approved" | "rejected", note: string) => Promise<string>;
  // Guided mode uses arrows to move between flags; list mode leaves it undefined.
  onFocusMove?: (dir: 1 | -1) => void;
  autofocus?: boolean;
}) {
  // The editable text is the concrete change Plumb would write (patch.after),
  // not the prose recommendation — so the diff a reviewer edits is the same one
  // shown before and after approval, and it's what recordDecision stores.
  const [note, setNote] = useState(flag.patch.after);
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [decidedAt, setDecidedAt] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [isPending, startTransition] = useTransition();

  const criterion = criterionInfo(flag.criterion);
  const conf = confidenceTone(flag.confidence);
  const friction = frictionFor(flag);
  const resolved = flag.status !== "pending";
  const active = !resolved || reopening;

  function commit(decision: "approved" | "rejected") {
    setConfirmOpen(false);
    setAck(false);
    startTransition(async () => {
      const at = await onDecide(flag.id, decision, note);
      setDecidedAt(at);
      setEditing(false);
      setReopening(false);
    });
  }

  function approve() {
    // Friction proportional to blast radius: a high-severity change always asks
    // for a deliberate acknowledgement, a low-confidence one asks to confirm, a
    // trusted low-risk one goes straight through.
    if (friction === "click") commit("approved");
    else setConfirmOpen(true);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // never hijack typing in the textarea
    if (onFocusMove && (e.key === "ArrowRight" || e.key === "j")) {
      onFocusMove(1);
      e.preventDefault();
      return;
    }
    if (onFocusMove && (e.key === "ArrowLeft" || e.key === "k")) {
      onFocusMove(-1);
      e.preventDefault();
      return;
    }
    if (isPending) return;
    if (resolved && !reopening) {
      if (e.key === "u" || e.key === "U") setReopening(true);
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === "a" || e.key === "A") approve();
    else if (e.key === "r" || e.key === "R" || e.key === "s" || e.key === "S") commit("rejected");
    else if (e.key === "e" || e.key === "E") setEditing((v) => !v);
    else return;
    e.preventDefault();
  }

  return (
    <div
      data-flag-card
      tabIndex={0}
      autoFocus={autofocus}
      onKeyDown={handleKeyDown}
      className={cn(
        "rounded-2xl border bg-card p-6 shadow-sm transition-colors duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        flag.status === "approved" && "border-primary/40",
        flag.status === "rejected" && "border-border",
        flag.false_positive && !resolved && "border-plum/40",
      )}
    >
      {typeof index === "number" && typeof total === "number" && (
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Decision {index + 1} of {total}
        </p>
      )}

      {/* Meta row: what, where, how sure, how much blast radius */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-mono font-medium text-foreground">{flag.component}</span>
        {/* tabIndex on the trigger spans so keyboard users can reach the
            explanations the old title= attributes kept hover-only. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground"
              />
            }
          >
            {criterion.label}
          </TooltipTrigger>
          <TooltipContent>{criterion.title}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="text-muted-foreground" />}>
            {SEVERITY_LABEL[flag.severity]}
          </TooltipTrigger>
          <TooltipContent>Blast radius: harm if left unfixed</TooltipContent>
        </Tooltip>
        <span aria-hidden className="text-border">·</span>
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className={conf.className} />}>
            {conf.label} · {flag.confidence}
          </TooltipTrigger>
          <TooltipContent>How sure Plumb is this finding is correct</TooltipContent>
        </Tooltip>
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-foreground">
        {flag.summary}
      </h3>

      {/* Plain-language action reads first, before any jargon */}
      <div className="mt-3">
        <p className="text-xs font-medium text-muted-foreground">What Plumb wants to do</p>
        <p className="mt-1 text-[15px] leading-relaxed text-foreground">{flag.plain}</p>
        {editing && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Change the wording Plumb will write. It updates the diff below.
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1.5 font-mono text-xs"
              aria-label="Edit the change Plumb will write"
            />
          </div>
        )}
      </div>

      {flag.false_positive && (
        <div className="mt-3 flex gap-2 rounded-lg border border-plum/30 bg-plum/5 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-plum" />
          <div className="text-xs leading-relaxed text-foreground/80">
            <span className="font-semibold text-plum">Plumb may be wrong here.</span>{" "}
            {flag.false_positive_note}
          </div>
        </div>
      )}

      {flag.illustrative && (
        <div className="mt-3 flex gap-2 rounded-lg border border-caution/40 bg-caution/5 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-caution" />
          <div className="text-xs leading-relaxed text-foreground/80">
            <span className="font-semibold text-caution">Authored demo flag.</span>{" "}
            {flag.illustrative_note}
          </div>
        </div>
      )}

      {/* Progressive disclosure: one expander holds all technical context so the
          number and the plain action stay legible above it. */}
      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        aria-expanded={detailsOpen}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", detailsOpen && "rotate-180")} />
        {detailsOpen ? "Hide the details" : "See the details"}
      </button>

      {detailsOpen && (
        <div className="mt-3 space-y-4 border-t border-border pt-4 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Why Plumb flagged it</p>
            <p className="mt-1 rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
              {flag.evidence}
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">The exact change</p>
            <DiffView before={flag.patch.before} after={note} file={flag.patch.file} />
          </div>
          <div className="text-xs text-muted-foreground">
            {sourceOfTruth && (
              <p>
                Source of truth:{" "}
                <a
                  href={`https://${sourceOfTruth}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-plum underline underline-offset-2 hover:opacity-80"
                >
                  {sourceOfTruth} <ExternalLink className="inline size-3" />
                </a>
              </p>
            )}
            <p className="mt-0.5">
              Drift found in:{" "}
              <a
                href={`https://${flag.source}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground underline underline-offset-2 hover:opacity-80"
              >
                {flag.source} <ExternalLink className="inline size-3" />
              </a>
            </p>
          </div>
        </div>
      )}

      <Separator className="my-4" />

      {resolved && !reopening ? (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          {flag.status === "approved" ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <Check className="size-4" /> Approved
                {decidedAt && (
                  <span className="text-xs font-normal text-muted-foreground">
                    · recorded {new Date(decidedAt).toLocaleTimeString()}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                This demo shows the change Plumb would submit as a pull request for your team
                to merge. It doesn&apos;t open a real PR, and nothing on the live doc changes
                until a human merges it.
              </p>
              <DiffView before={flag.patch.before} after={note} file={flag.patch.file} />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <X className="size-4" /> Skipped
              {decidedAt && (
                <span className="text-xs font-normal">
                  · recorded {new Date(decidedAt).toLocaleTimeString()}
                </span>
              )}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-auto gap-1 p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setReopening(true)}
          >
            <Undo2 className="size-3" /> Undo
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={isPending} onClick={approve} className="gap-1.5">
            <Check className="size-4" /> Approve
          </Button>
          <Button variant="outline" disabled={isPending} onClick={() => commit("rejected")}>
            No, skip this one
          </Button>
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() => setEditing((v) => !v)}
            className="gap-1.5 text-muted-foreground"
          >
            <Pencil className="size-3.5" /> {editing ? "Done" : "Edit the wording"}
          </Button>
          {reopening && (
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setReopening(false)}>
              Cancel
            </Button>
          )}
          {active && (
            <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
              A approve · S skip · E edit
            </span>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setAck(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {friction === "deliberate"
                ? "This is a high-blast-radius change."
                : "Plumb wasn't sure enough to skip you."}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {friction === "deliberate"
                ? "A high-severity change can mislead every reader downstream. Approving records this as your call, not the model's."
                : `Plumb rated this ${conf.label.toLowerCase()} (${flag.confidence}). Approving records this as your judgment, not the agent's.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DiffView before={flag.patch.before} after={note} file={flag.patch.file} />
          {friction === "deliberate" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              I&apos;ve read the change above and take responsibility for it.
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={friction === "deliberate" && !ack}
              onClick={() => commit("approved")}
              className="gap-1.5"
            >
              <Check className="size-4" /> Yes, approve
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
