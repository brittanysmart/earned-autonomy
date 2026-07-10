"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/flags";
import { authorityInfo } from "@/lib/plumb";

export function SourcesScreen({ sources }: { sources: Source[] }) {
  const ranked = [...sources].sort(
    (a, b) => authorityInfo(a.authority).rank - authorityInfo(b.authority).rank,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h2 className="text-2xl font-semibold tracking-tight">Who outranks whom</h2>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
        Every Badge doc has a declared authority, so the hierarchy is data, not tribal knowledge.
        Plumb measures the rest against the source of truth. A source with a named owner has
        someone to route a flag to; one without is where drift hides.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Document</th>
              <th className="px-4 py-3 font-medium">Authority</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Last fetched</th>
              <th className="px-4 py-3 text-right font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s) => {
              const auth = authorityInfo(s.authority);
              const unowned = /^no owner/i.test(s.owner);
              return (
                <tr key={s.source} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <a
                      href={`https://${s.source}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-foreground underline underline-offset-2 hover:opacity-80"
                    >
                      {s.source} <ExternalLink className="size-3 shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
                        auth.rank === 1
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {auth.label}
                    </span>
                  </td>
                  <td className={cn("px-4 py-3 text-xs", unowned ? "text-caution" : "text-foreground")}>
                    {s.owner}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {s.last_fetched}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.flag_count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-5 max-w-xl text-xs leading-relaxed text-muted-foreground">
        Notifications are deliberately not built. Routing is downstream of ownership: you
        can&apos;t tell the right person until you&apos;ve decided who owns the decision. The
        owner column is the primitive that makes routing possible later.
      </p>
    </div>
  );
}
