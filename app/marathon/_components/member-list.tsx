"use client";

import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Agent = { id: string; name: string };

export function MemberList({ agents }: { agents: Agent[] }) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? agents.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()))
    : agents;

  return (
    <div>
      {/* No autoFocus — this is a shared kiosk home screen, not a
          single-purpose field, so the on-screen keyboard shouldn't pop
          up uninvited when the page loads. */}
      {agents.length > 0 && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your name…"
          className="mb-3"
        />
      )}

      <div className="space-y-2.5">
        {filtered.map((agent) => (
          <Link
            key={agent.id}
            href={`/marathon/pin?agent=${agent.id}`}
            className="border-border bg-surface flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 shadow-sm transition-transform active:scale-[0.98]"
          >
            <Avatar name={agent.name} />
            <span className="text-foreground font-semibold">{agent.name}</span>
            <ChevronRight className="text-muted ml-auto size-4 shrink-0" />
          </Link>
        ))}
        {filtered.length === 0 && agents.length > 0 && (
          <p className="text-muted text-sm">No one matches &ldquo;{query}&rdquo;.</p>
        )}
        {agents.length === 0 && (
          <p className="text-muted text-sm">No members yet. Ask an admin to add one.</p>
        )}
      </div>
    </div>
  );
}
