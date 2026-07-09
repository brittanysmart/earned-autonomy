"use client";

import { useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { Check, ExternalLink, Microscope, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionStatus, Flag, Severity } from "@/lib/flags";
import { recordDecision } from "@/app/actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low severity",
  medium: "Medium severity",
  high: "High severity",
};

const SEVERITY_TITLE: Record<Severity, string> = {
  low: "Low severity: minor issue, low impact if ignored",
  medium: "Medium severity: worth fixing, not urgent",
  high: "High severity: a real gap someone should act on",
};

// Plain-English label for each criterion, since the underlying names are
// script-internal category names, not something a reader has seen before.
// The technical name still shows up in the tooltip for anyone who wants it.
const CRITERION_LABEL: Record<string, { label: string; title: string }> = {
  judgment_boundaries: {
    label: "Missing usage guidance",
    title:
      "judgment_boundaries: this source doesn't say when to use (or not use) the component",
  },
  terminology_consistency: {
    label: "Naming mismatch",
    title:
      "terminology_consistency: this source uses different terms/variants than the official docs",
  },
  staleness_drift: {
    label: "Might be outdated",
    title: "staleness_drift: no date or version marker found to confirm this is current",
  },
  retrievability: {
    label: "Missing API reference",
    title: "retrievability: no prop/type/default table found, hard for a tool to extract",
  },
};

function criterionInfo(criterion: string) {
  return (
    CRITERION_LABEL[criterion] ?? {
      label: criterion.replaceAll("_", " "),
      title: criterion,
    }
  );
}

// Bucketed rather than raw: a naked "confidence 88" reads as decoration.
// Reviewers act on the label, so the label carries the signal. Rendered as
// colored text rather than a filled badge — one more saturated pill per card
// adds noise without adding information the criterion badge doesn't already
// carry attention for.
function confidenceBucket(confidence: number): {
  label: string;
  title: string;
  className: string;
} {
  const title = "How sure the script is that this flag is correct.";
  if (confidence >= 85)
    return {
      label: `High confidence · ${confidence}`,
      title,
      className: "text-emerald-700 dark:text-emerald-400",
    };
  if (confidence >= 60)
    return {
      label: `Medium confidence · ${confidence}`,
      title,
      className: "text-amber-700 dark:text-amber-400",
    };
  return {
    label: `Low confidence · ${confidence}`,
    title,
    className: "text-muted-foreground",
  };
}

function countBySeverity(flags: Flag[]): Record<Severity, number> {
  return {
    low: flags.filter((f) => f.severity === "low").length,
    medium: flags.filter((f) => f.severity === "medium").length,
    high: flags.filter((f) => f.severity === "high").length,
  };
}

type SourceSummary = {
  source: string;
  count: number;
  avgConfidence: number;
  severityMix: Record<Severity, number>;
};

// One row per doc source rather than per flag: this is what a reviewer
// actually wants to know at a glance — which source is the problem, not
// just how many problems exist in total.
function summarizeSources(flags: Flag[]): SourceSummary[] {
  const bySource = new Map<string, Flag[]>();
  for (const f of flags) {
    bySource.set(f.source, [...(bySource.get(f.source) ?? []), f]);
  }
  return [...bySource.entries()]
    .map(([source, group]) => ({
      source,
      count: group.length,
      avgConfidence: Math.round(group.reduce((sum, f) => sum + f.confidence, 0) / group.length),
      severityMix: countBySeverity(group),
    }))
    .sort((a, b) => b.count - a.count);
}

const STATUS_FILTERS: Array<{ value: DecisionStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const SEVERITY_FILTERS: Array<{ value: Severity | "all"; label: string }> = [
  { value: "all", label: "All severities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

type SortKey = "confidence-asc" | "confidence-desc" | "severity";
const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

function QueueItem({
  flag,
  onDecide,
  onSnooze,
}: {
  flag: Flag;
  onDecide: (id: string, decision: "approved" | "rejected", note: string) => Promise<string>;
  onSnooze: (id: string) => void;
}) {
  const [note, setNote] = useState(flag.proposed_action);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastDecidedAt, setLastDecidedAt] = useState<string | null>(null);
  // A stray keypress at review speed shouldn't be permanent — "Change
  // decision" re-opens a resolved card to the same approve/reject/edit
  // controls a pending one has, reusing the same recordDecision call rather
  // than a separate undo mechanism.
  const [reopening, setReopening] = useState(false);
  const [isPending, startTransition] = useTransition();
  const confidence = confidenceBucket(flag.confidence);

  function decide(decision: "approved" | "rejected") {
    setConfirmOpen(false);
    startTransition(async () => {
      const decidedAt = await onDecide(flag.id, decision, note);
      setLastDecidedAt(decidedAt);
      setEditing(false);
      setReopening(false);
    });
  }

  function handleApproveClick() {
    // Friction here is deliberate: one-click approve on a flag the scorer
    // itself said needs a human would just move the rubber stamp from the
    // model's confidence number to a careless click.
    if (flag.requires_human_review) {
      setConfirmOpen(true);
    } else {
      decide("approved");
    }
  }

  const criterion = criterionInfo(flag.criterion);
  // Resolve state gets a settle animation and a felt outcome, not points or
  // a streak counter. Approving a flag is a real trust decision here, not a
  // low-stakes tap to farm — the feedback should feel earned, not gamified.
  const resolved = flag.status !== "pending";

  // Keyboard shortcuts only fire when the card itself has focus, not when a
  // key is typed into the note textarea — a plain a/e/r in someone's edited
  // note text must never be read as a command.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;

    // J/K move focus between cards regardless of resolved state, so a
    // reviewer can navigate past already-decided items without a mouse.
    if (e.key === "j" || e.key === "k") {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-queue-card]"));
      const index = cards.indexOf(e.currentTarget);
      const next = e.key === "j" ? cards[index + 1] : cards[index - 1];
      next?.focus();
      e.preventDefault();
      return;
    }

    if ((resolved && !reopening) || isPending) return;
    if (e.key === "a" || e.key === "A") handleApproveClick();
    else if (e.key === "r" || e.key === "R") decide("rejected");
    else if (e.key === "e" || e.key === "E") setEditing((v) => !v);
    else if ((e.key === "s" || e.key === "S") && !resolved) onSnooze(flag.id);
    else return;
    e.preventDefault();
  }

  return (
    <Card
      data-queue-card
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "group transition-colors duration-500 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        flag.status === "approved" && "border-emerald-500/40",
        flag.status === "rejected" && "border-red-500/40",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{flag.component}</span>
            <Badge variant="outline" title={criterion.title}>
              {criterion.label}
            </Badge>
          </div>
          <a
            href={`https://${flag.source}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-sm text-primary underline underline-offset-2 hover:opacity-80"
          >
            {flag.source}
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <p className="text-xs text-muted-foreground">
            <span title={SEVERITY_TITLE[flag.severity]}>{SEVERITY_LABEL[flag.severity]}</span>
            {" · "}
            <span className={confidence.className} title={confidence.title}>
              {confidence.label}
            </span>
          </p>
        </div>
        {resolved && (
          <Badge
            variant={flag.status === "approved" ? "default" : "destructive"}
            className="animate-in zoom-in-50 fade-in gap-1 duration-300"
          >
            {flag.status === "approved" ? (
              <Check className="size-3" />
            ) : (
              <X className="size-3" />
            )}
            {flag.status}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{flag.summary}</p>
        <p className="rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
          {flag.evidence}
        </p>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Proposed action</p>
          {editing ? (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="text-sm"
            />
          ) : (
            <p className="text-sm">{note}</p>
          )}
        </div>

        {resolved && !reopening ? (
          <div className="flex items-center gap-2 pt-1 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300">
            {flag.status === "approved" ? (
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <X className="size-4 text-red-600 dark:text-red-400" />
            )}
            <span className="font-medium">
              {flag.status === "approved" ? "Approved" : "Rejected"}
            </span>
            {lastDecidedAt && (
              <span className="text-xs text-muted-foreground">
                · recorded {new Date(lastDecidedAt).toLocaleTimeString()}
              </span>
            )}
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setReopening(true)}
            >
              Change decision
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" disabled={isPending} onClick={handleApproveClick}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => decide("rejected")}
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Done editing" : "Edit"}
            </Button>
            {resolved ? (
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setReopening(false)}>
                Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => onSnooze(flag.id)}
                title="Hide this from your queue for now — not a decision, doesn't get recorded"
              >
                Snooze
              </Button>
            )}
            <span className="ml-1 hidden text-xs text-muted-foreground group-focus:inline-block">
              A approve · R reject · E edit{!resolved && " · S snooze"} · J/K navigate
            </span>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve a flag the scorer couldn&apos;t confirm itself?</AlertDialogTitle>
            <AlertDialogDescription>
              This flag is marked <strong className="text-foreground">requires human review</strong>{" "}
              ({confidence.label}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Evidence</p>
            <p className="rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
              {flag.evidence}
            </p>
          </div>
          <p className="text-sm">
            Approving records this as <span className="font-medium">your</span>{" "}
            judgment call, not the agent&apos;s.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => decide("approved")}>
              Yes, approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SectionHeading({
  title,
  count,
  hint,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  count: number;
  hint: string;
  icon?: typeof Microscope;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      {Icon && <Icon className={cn("size-4 translate-y-px", iconClassName)} />}
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <span className="text-xs text-muted-foreground">
        {count} · {hint}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold tabular-nums", valueClassName)}>{value}</p>
      </CardContent>
    </Card>
  );
}

// The four counts here are the same source SummaryStrip used to read —
// promoted into cards, not recomputed a second way, so there's exactly one
// place on the page that can disagree with itself about the totals.
function DashboardSummary({ flags }: { flags: Flag[] }) {
  const total = flags.length;
  const pending = flags.filter((f) => f.status === "pending").length;
  const approved = flags.filter((f) => f.status === "approved").length;
  const rejected = flags.filter((f) => f.status === "rejected").length;
  const resolved = approved + rejected;
  const progressPct = total ? Math.round((resolved / total) * 100) : 0;
  const severityCounts = countBySeverity(flags);
  const sources = summarizeSources(flags);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total flags" value={total} />
        <StatCard label="Pending" value={pending} />
        <StatCard
          label="Approved"
          value={approved}
          valueClassName="text-emerald-700 dark:text-emerald-400"
        />
        <StatCard
          label="Rejected"
          value={rejected}
          valueClassName="text-red-600 dark:text-red-400"
        />
      </div>

      <Card>
        <CardContent className="space-y-2 py-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Review progress</span>
            <span>
              {resolved} of {total} reviewed · {progressPct}%
            </span>
          </div>
          {/* Gradient echoes the Solaris cover's sky-to-ocean sweep rather
              than a flat brand color — the one deliberate signature touch
              on this page. */}
          <Progress
            aria-label="Review progress"
            value={progressPct}
            indicatorStyle={{ background: "linear-gradient(to right, #d9a441, #16264d)" }}
            trackClassName="bg-foreground/10"
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold tracking-tight">By severity</h2>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {(["high", "medium", "low"] as const).map((sev) => (
              <div key={sev} className="flex items-center justify-between">
                <span className="text-muted-foreground">{SEVERITY_LABEL[sev]}</span>
                <span className="font-medium tabular-nums">{severityCounts[sev]}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold tracking-tight">Sources</h2>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-1.5">Source</TableHead>
                  <TableHead className="px-1.5 text-right" title="Flag count">
                    Flags
                  </TableHead>
                  <TableHead className="px-1.5 text-right" title="Average confidence">
                    Conf.
                  </TableHead>
                  <TableHead className="px-1.5 text-right" title="High · Medium · Low">
                    Sev.
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.source}>
                    <TableCell className="max-w-28 whitespace-normal break-all px-1.5 font-mono text-xs">
                      {s.source}
                    </TableCell>
                    <TableCell className="px-1.5 text-right tabular-nums">{s.count}</TableCell>
                    <TableCell className="px-1.5 text-right tabular-nums">
                      {s.avgConfidence}
                    </TableCell>
                    <TableCell
                      className="px-1.5 text-right font-mono text-xs text-muted-foreground"
                      title="High · Medium · Low"
                    >
                      {s.severityMix.high}·{s.severityMix.medium}·{s.severityMix.low}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ApprovalQueue({ flags: initialFlags }: { flags: Flag[] }) {
  const [flags, setFlags] = useState(initialFlags);
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("confidence-desc");
  // Defaults to false: the contrast between the rare auto-flaggable item and
  // everything that needs a human is the whole point of this queue, and a
  // reviewer can't see a contrast that's filtered out of view. Confidence-desc
  // sort still puts it first, so opting into focus mode is one click away.
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  // Snoozing is explicitly NOT a decision — it never touches decisions.json,
  // just this component's state. Every entry in the persisted log is meant
  // to be a real human judgment call; a "not now" has no business in there.
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());

  async function handleDecide(id: string, decision: "approved" | "rejected", note: string) {
    const entry = await recordDecision(id, decision, note);
    setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, status: entry.decision } : f)));
    return entry.decided_at;
  }

  function handleSnooze(id: string) {
    setSnoozedIds((prev) => new Set(prev).add(id));
  }

  const filteredFlags = useMemo(() => {
    let result = flags.filter((f) => !snoozedIds.has(f.id));
    if (statusFilter !== "all") result = result.filter((f) => f.status === statusFilter);
    if (severityFilter !== "all") result = result.filter((f) => f.severity === severityFilter);
    return [...result].sort((a, b) => {
      if (sortKey === "confidence-desc") return b.confidence - a.confidence;
      if (sortKey === "confidence-asc") return a.confidence - b.confidence;
      return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    });
  }, [flags, snoozedIds, statusFilter, severityFilter, sortKey]);

  // Split by trust status rather than just filtering it away: severity and
  // confidence are independent axes (a "high severity" item can still be the
  // one flag trusted to skip review), and a flat list that only ever hides
  // one side makes that easy to misread as "the scary ones need review."
  // Two labeled groups keep both visible and name the distinction directly.
  const reviewFlags = filteredFlags.filter((f) => f.requires_human_review);
  const autoFlags = filteredFlags.filter((f) => !f.requires_human_review);
  const visibleFlags = needsReviewOnly ? reviewFlags : filteredFlags;
  const hasActiveFilters = statusFilter !== "all" || severityFilter !== "all" || needsReviewOnly;
  // Checked ahead of hasActiveFilters: with no filter active, resolved flags
  // stay visible (they just carry an approved/rejected badge), so a filtered
  // view being empty and "every flag is actually done" are different events
  // that call for different copy, not the same generic "no matches" message.
  const allResolved = flags.length > 0 && flags.every((f) => f.status !== "pending");

  return (
    <div className="space-y-4">
      <DashboardSummary flags={flags} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={statusFilter === opt.value ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <select
          aria-label="Filter by severity"
          className="h-7 rounded-md border-none bg-transparent px-1 text-xs"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Severity | "all")}
        >
          {SEVERITY_FILTERS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort by"
          className="h-7 rounded-md border-none bg-transparent px-1 text-xs"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="confidence-desc">Confidence: high to low</option>
          <option value="confidence-asc">Confidence: low to high</option>
          <option value="severity">Severity: high to low</option>
        </select>

        <Toggle
          pressed={needsReviewOnly}
          onPressedChange={setNeedsReviewOnly}
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
        >
          Needs review only
        </Toggle>

        {snoozedIds.size > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setSnoozedIds(new Set())}
          >
            {snoozedIds.size} snoozed · show
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          showing {visibleFlags.length} of {flags.length}
        </span>
      </div>

      {visibleFlags.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {flags.length === 0 ? (
            <p>No flags to review.</p>
          ) : allResolved ? (
            <p>Every flag has been reviewed. Nothing left in the queue.</p>
          ) : hasActiveFilters ? (
            <>
              <p>No flags match this filter.</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setStatusFilter("all");
                  setSeverityFilter("all");
                  setNeedsReviewOnly(false);
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <p>Everything left is snoozed. Use &quot;{snoozedIds.size} snoozed · show&quot; above.</p>
          )}
        </div>
      ) : (
        <>
          {reviewFlags.length > 0 && (
            <section className="space-y-4">
              <SectionHeading
                title="Needs your review"
                count={reviewFlags.length}
                hint="confidence below 90, so a person decides, not the model"
                icon={Microscope}
                iconClassName="text-sky-500 dark:text-sky-400"
              />
              {reviewFlags.map((flag) => (
                <QueueItem key={flag.id} flag={flag} onDecide={handleDecide} onSnooze={handleSnooze} />
              ))}
            </section>
          )}

          {!needsReviewOnly && autoFlags.length > 0 && (
            <section className="space-y-4 rounded-lg border border-dashed p-4">
              <SectionHeading
                title="High confidence, not a free pass"
                count={autoFlags.length}
                hint="confidence 90+, but severity can still be high. This is about trust, not urgency."
                icon={ShieldCheck}
                iconClassName="text-muted-foreground"
              />
              <div className="space-y-4">
                {autoFlags.map((flag) => (
                  <QueueItem key={flag.id} flag={flag} onDecide={handleDecide} onSnooze={handleSnooze} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
