"use client";

import { useState, useTransition } from "react";
import type { Flag } from "@/lib/flags";
import { recordDecision } from "@/app/actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const SEVERITY_VARIANT: Record<Flag["severity"], "default" | "secondary" | "destructive"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
};

function QueueItem({ flag }: { flag: Flag }) {
  const [status, setStatus] = useState(flag.status);
  const [note, setNote] = useState(flag.proposed_action);
  const [editing, setEditing] = useState(false);
  const [lastDecidedAt, setLastDecidedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const entry = await recordDecision(flag.id, decision, note);
      setStatus(entry.decision);
      setLastDecidedAt(entry.decided_at);
      setEditing(false);
    });
  }

  return (
    <Card
      className={
        flag.requires_human_review
          ? "border-l-4 border-l-amber-500"
          : "border-l-4 border-l-emerald-500"
      }
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{flag.component}</span>
            <Badge variant={SEVERITY_VARIANT[flag.severity]}>{flag.severity}</Badge>
            <Badge variant="outline">{flag.criterion.replaceAll("_", " ")}</Badge>
            <Badge variant="outline">confidence {flag.confidence}</Badge>
            {flag.requires_human_review ? (
              <Badge className="bg-amber-500 text-white">requires human review</Badge>
            ) : (
              <Badge className="bg-emerald-600 text-white">auto-flaggable</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{flag.source}</p>
        </div>
        <Badge
          variant={
            status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary"
          }
        >
          {status}
        </Badge>
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

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" disabled={isPending} onClick={() => decide("approved")}>
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
          {lastDecidedAt && (
            <span className="text-xs text-muted-foreground">
              recorded {new Date(lastDecidedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ApprovalQueue({ flags }: { flags: Flag[] }) {
  return (
    <div className="space-y-4">
      {flags.map((flag) => (
        <QueueItem key={flag.id} flag={flag} />
      ))}
    </div>
  );
}
