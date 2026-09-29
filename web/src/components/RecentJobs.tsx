"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fileUrl, Pill } from "./ui";

type Row = { id: string; createdAt: number; status: string; target: string; kind: string; name?: string; thumb?: string };

export function RecentJobs() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch("/api/jobs").then((r) => r.json()).then(setRows).catch(() => setRows([]));
  }, []);
  if (!rows?.length) return null;
  return (
    <section className="mt-24">
      <h2 className="mb-5 text-sm font-medium tracking-wide text-muted uppercase">Recent reels</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Link key={r.id} href={`/jobs/${r.id}`} className="group glass overflow-hidden rounded-2xl transition hover:border-accent/40">
            <div className="aspect-video bg-black/40">
              {r.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(r.id, r.thumb)} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
              ) : (
                <div className="grid h-full place-items-center font-mono text-xs text-muted">{r.status.replace("_", " ")}</div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="truncate font-semibold">{r.name ?? r.target.replace(/^https?:\/\//, "")}</div>
                <div className="truncate text-xs text-muted">{r.target}</div>
              </div>
              <Pill tone={r.status === "done" ? "good" : r.status === "failed" ? "bad" : "accent"}>{r.status.replace("_", " ")}</Pill>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
