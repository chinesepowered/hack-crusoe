"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Kind = "website" | "expo";
type Cut = "short" | "main";

export function CreateForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("website");
  const [target, setTarget] = useState("");
  const [cuts, setCuts] = useState<Cut[]>(["short", "main"]);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [approval, setApproval] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggleCut = (c: Cut) => setCuts((cs) => (cs.includes(c) ? (cs.length > 1 ? cs.filter((x) => x !== c) : cs) : [...cs, c]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, target: target.trim(), cuts, founderNotes: notes.trim() || undefined, requireApproval: approval }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    router.push(`/jobs/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="glass relative rounded-3xl p-2 shadow-[0_40px_120px_-40px_rgba(167,139,250,0.35)]">
      <div className="flex gap-1 rounded-2xl bg-black/30 p-1">
        {(
          [
            ["website", "Website", "Any live URL"],
            ["expo", "Expo app", "Git URL or local folder"],
          ] as const
        ).map(([k, label, hint]) => (
          <button
            type="button"
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-left transition ${kind === k ? "bg-white/10 text-ink" : "text-muted hover:text-ink"}`}
          >
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-xs opacity-70">{hint}</div>
          </button>
        ))}
      </div>

      <div className="p-4 pb-3">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-black/40 px-4 focus-within:border-accent/60">
          <span className="font-mono text-sm text-muted">{kind === "website" ? "URL" : "Repo"}</span>
          <input
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={kind === "website" ? "https://yourproduct.com" : "https://github.com/you/your-expo-app or ~/code/my-app"}
            className="h-14 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted/50"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CutToggle on={cuts.includes("short")} onClick={() => toggleCut("short")} ratio="9:16" label="YouTube Short" sub="about 30s" />
          <CutToggle on={cuts.includes("main")} onClick={() => toggleCut("main")} ratio="16:9" label="1-minute promo" sub="about 60s" />
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
            <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} className="accent-[var(--accent)]" />
            Let me approve before rendering
          </label>
        </div>

        {showNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional: anything to emphasize? e.g. 'works offline', 'aimed at nurses'"
            className="mt-4 w-full resize-none rounded-2xl border border-line bg-black/40 p-4 text-sm outline-none placeholder:text-muted/50 focus:border-accent/60"
          />
        ) : (
          <button type="button" onClick={() => setShowNotes(true)} className="mt-3 text-sm text-muted hover:text-ink">
            + Anything to emphasize?
          </button>
        )}

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}

        <button
          disabled={busy}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-accent2 text-[16px] font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Assembling the crew..." : "Make my launch videos"}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </form>
  );
}

function CutToggle({ on, onClick, ratio, label, sub }: { on: boolean; onClick: () => void; ratio: string; label: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${on ? "border-accent/60 bg-accent/10" : "border-line text-muted hover:border-white/20"}`}
    >
      <div
        className={`rounded-[5px] border-2 ${on ? "border-accent" : "border-muted/60"}`}
        style={ratio === "9:16" ? { width: 12, height: 20 } : { width: 22, height: 13 }}
      />
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs opacity-70">
          {ratio} · {sub}
        </div>
      </div>
    </button>
  );
}
