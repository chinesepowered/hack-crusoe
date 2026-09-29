import type { ReactNode } from "react";

export const AGENTS: Record<string, { name: string; color: string; initials: string }> = {
  director: { name: "Reel Director", color: "#a78bfa", initials: "RD" },
  web_scout: { name: "Web Scout", color: "#38bdf8", initials: "WS" },
  app_scout: { name: "App Scout", color: "#22d3ee", initials: "AS" },
  writer: { name: "Storyboard Writer", color: "#fbbf24", initials: "SW" },
  critic: { name: "Frame Critic", color: "#fb7185", initials: "FC" },
  producer: { name: "Producer", color: "#34d399", initials: "PR" },
  human: { name: "You", color: "#e5e7eb", initials: "YOU" },
  system: { name: "Room", color: "#6b7280", initials: "•" },
};

export function Avatar({ who, size = 32 }: { who: string; size?: number }) {
  const a = AGENTS[who] ?? AGENTS.system;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-xl font-mono font-semibold text-black"
      style={{ width: size, height: size, background: a.color, fontSize: size * (a.initials.length > 2 ? 0.28 : 0.36) }}
    >
      {a.initials}
    </div>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent to-accent2 shadow-[0_8px_30px_-8px_var(--accent)]">
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-black">
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
        </svg>
      </div>
      <span className="text-[17px] font-semibold tracking-tight">LaunchReel</span>
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "good" | "bad" | "accent" | "warn" }) {
  const cls = {
    muted: "border-line text-muted",
    good: "border-good/40 text-good bg-good/10",
    bad: "border-bad/40 text-bad bg-bad/10",
    accent: "border-accent/40 text-accent bg-accent/10",
    warn: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export const fileUrl = (id: string, rel: string, download = false) => `/api/files/${id}/${rel}${download ? "?download" : ""}`;
