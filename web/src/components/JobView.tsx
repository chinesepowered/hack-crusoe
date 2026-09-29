"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CrewMessage, Job } from "@/engine/store";
import { AGENTS, Avatar, fileUrl, Logo, Pill } from "./ui";

const STAGES = [
  { key: "capturing", label: "Capture" },
  { key: "understanding", label: "Understand" },
  { key: "writing", label: "Write" },
  { key: "reviewing", label: "Critique" },
  { key: "awaiting_approval", label: "Approve" },
  { key: "rendering", label: "Render" },
  { key: "done", label: "Ready" },
] as const;
const ORDER = ["queued", "capturing", "understanding", "writing", "reviewing", "awaiting_approval", "narrating", "rendering", "done"];

export function JobView({ initial }: { initial: Job }) {
  const [job, setJob] = useState<Job>(initial);
  useEffect(() => {
    const es = new EventSource(`/api/jobs/${initial.id}/stream`);
    es.onmessage = (e) => setJob(JSON.parse(e.data));
    return () => es.close();
  }, [initial.id]);

  const cost = job.usage.reduce((a, u) => a + u.usd, 0);
  const tokens = job.usage.reduce((a, u) => a + u.input + u.output, 0);
  const live = !["done", "failed"].includes(job.status);
  const title = job.understanding?.name ?? job.capture?.name ?? job.input.target.replace(/^https?:\/\//, "");

  return (
    // On large screens the job page is a one-screen dashboard: the columns scroll, the page does not.
    <main className="grain relative flex flex-1 flex-col lg:h-screen lg:overflow-hidden">
      <div className="aurora opacity-60" />
      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-6 pb-16 lg:min-h-0 lg:pb-6">
        <nav className="flex shrink-0 items-center justify-between py-5">
          <Link href="/">
            <Logo />
          </Link>
          <Link href="/" className="rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:text-ink">
            New reel
          </Link>
        </nav>

        <header className="glass shrink-0 rounded-3xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="truncate text-3xl font-semibold tracking-tight">{title}</h1>
                <StatusPill status={job.status} />
              </div>
              <p className="mt-1 truncate text-sm text-muted">
                {job.understanding?.oneLiner ?? job.input.target} · {job.input.kind === "expo" ? "Expo app" : "Website"}
              </p>
            </div>
            <div className="flex gap-3">
              <Stat label="Model spend" value={`$${cost.toFixed(cost < 0.1 ? 4 : 2)}`} sub={`${(tokens / 1000).toFixed(1)}k tokens`} />
              <Stat label="Critic rounds" value={String(job.messages.filter((m) => m.verdict).length)} sub={`${job.messages.filter((m) => m.verdict === "BLOCKED").length} blocked`} />
              <Stat label="Crew" value={String(job.roster.length)} sub={job.bandRoomId ? "on Band" : "local room"} />
            </div>
          </div>
          <Stepper status={job.status} />
          {live && (
            <div className="mt-4 flex items-center gap-3 text-sm text-muted">
              <span className="live-dot h-2 w-2 rounded-full bg-accent" />
              {job.step ?? "Starting"}
              {job.progress != null && job.status !== "done" && ["narrating", "rendering"].includes(job.status) && (
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} />
                </div>
              )}
            </div>
          )}
          {job.status === "failed" && <p className="mt-4 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{job.error}</p>}
        </header>

        <div className="mt-6 grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_440px]">
          <div className="min-w-0 space-y-6 lg:overflow-y-auto lg:pr-1">
            {!job.capture && live && <Warmup job={job} />}
            {job.status === "awaiting_approval" && <Approval job={job} />}
            {job.outputs.length > 0 && <Outputs job={job} />}
            {job.storyboard && <StoryboardView job={job} />}
            {job.capture && <Captured job={job} />}
          </div>
          <Room job={job} />
        </div>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: Job["status"] }) {
  if (status === "done") return <Pill tone="good">ready</Pill>;
  if (status === "failed") return <Pill tone="bad">failed</Pill>;
  if (status === "awaiting_approval") return <Pill tone="warn">needs you</Pill>;
  return <Pill tone="accent">{status.replace("_", " ")}</Pill>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-[120px] rounded-2xl border border-line bg-black/30 px-4 py-3">
      <div className="text-[11px] tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}

function Stepper({ status }: { status: Job["status"] }) {
  const idx = ORDER.indexOf(status === "narrating" ? "rendering" : status);
  return (
    <div className="mt-6 grid grid-cols-7 gap-2">
      {STAGES.map((s) => {
        const i = ORDER.indexOf(s.key);
        const done = status === "done" || idx > i;
        const now = idx === i && status !== "done";
        return (
          <div key={s.key}>
            <div className={`h-1.5 rounded-full ${done ? "bg-gradient-to-r from-accent to-accent2" : now ? "live-dot bg-accent/70" : "bg-white/10"}`} />
            <div className={`mt-2 text-xs ${done || now ? "text-ink" : "text-muted"}`}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Shown until the scout's first screenshots land, so the page is never blank. */
function Warmup({ job }: { job: Job }) {
  const expo = job.input.kind === "expo";
  return (
    <Card title="Capturing" right={<Pill tone="accent">live</Pill>}>
      <p className="text-sm text-muted">
        The {expo ? "App Scout" : "Web Scout"} is opening <span className="text-ink">{job.input.target}</span>
        {expo ? ", building it for the web and tapping through its screens." : " in a real browser and reading every page."}
      </p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer aspect-video rounded-xl border border-line" style={{ animationDelay: `${i * 0.25}s` }} />
        ))}
      </div>
    </Card>
  );
}

function Approval({ job }: { job: Job }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const last = [...job.messages].reverse().find((m) => m.to.includes("human") && m.images?.length);
  const send = async (t: string) => {
    setBusy(true);
    await fetch(`/api/jobs/${job.id}/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
    setText("");
    setBusy(false);
  };
  return (
    <Card title="Your call" right={<Pill tone="warn">the Director is waiting on you</Pill>}>
      <p className="text-sm text-muted">{last?.text}</p>
      {last?.images && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {last.images.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f} src={fileUrl(job.id, f)} alt="" className="rounded-lg border border-line" />
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => send("approve")} className="rounded-xl bg-good px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
          Approve and render
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or ask for changes, e.g. 'make the hook about saving time'"
          className="min-w-[260px] flex-1 rounded-xl border border-line bg-black/40 px-4 text-sm outline-none focus:border-accent/60"
        />
        <button disabled={busy || !text.trim()} onClick={() => send(text)} className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold disabled:opacity-40">
          Request changes
        </button>
      </div>
    </Card>
  );
}

function Outputs({ job }: { job: Job }) {
  return (
    <Card title="Ready to post" right={<Pill tone="good">mastered to -14 LUFS for YouTube</Pill>}>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        {job.outputs.map((o) => (
          <OutputItem key={o.cut} job={job} o={o} />
        ))}
      </div>
    </Card>
  );
}

function OutputItem({ job, o }: { job: Job; o: Job["outputs"][number] }) {
  const [meta, setMeta] = useState("");
  useEffect(() => {
    fetch(fileUrl(job.id, o.youtube)).then((r) => r.text()).then(setMeta);
  }, [job.id, o.youtube]);
  const vertical = o.cut === "short";
  return (
    <>
      <video
        src={fileUrl(job.id, o.video)}
        controls
        playsInline
        preload="metadata"
        poster={o.thumb && !vertical ? fileUrl(job.id, o.thumb) : undefined}
        className={`rounded-2xl border border-line bg-black object-cover ${vertical ? "aspect-[9/16] w-[260px]" : "aspect-video w-full max-w-[560px]"}`}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{vertical ? "YouTube Short" : "1-minute promo"}</h3>
          <span className="font-mono text-xs text-muted">{o.duration.toFixed(1)}s</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={fileUrl(job.id, o.video, true)} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">Download MP4</a>
          <a href={fileUrl(job.id, o.srt, true)} className="rounded-xl border border-line px-4 py-2 text-sm">Captions (.srt)</a>
          {o.thumb && <a href={fileUrl(job.id, o.thumb, true)} className="rounded-xl border border-line px-4 py-2 text-sm">Thumbnail</a>}
          <button onClick={() => navigator.clipboard.writeText(meta)} className="rounded-xl border border-line px-4 py-2 text-sm">Copy YouTube text</button>
        </div>
        <pre className="mt-4 max-h-56 overflow-auto rounded-xl border border-line bg-black/40 p-4 font-sans text-xs leading-relaxed whitespace-pre-wrap text-muted">{meta}</pre>
      </div>
    </>
  );
}

function StoryboardView({ job }: { job: Job }) {
  const cuts = (Object.keys(job.storyboard!.cuts) as ("short" | "main")[]).filter((c) => job.storyboard!.cuts[c]?.length);
  const [cut, setCut] = useState(cuts[0]);
  const scenes = job.storyboard!.cuts[cut] ?? [];
  const shots = Object.fromEntries((job.capture?.shots ?? []).map((s) => [s.id, s]));
  const stillDir = `stills/r${job.revisions}/${cut}`;
  return (
    <Card
      title={`Storyboard${job.revisions ? ` · revision ${job.revisions}` : ""}`}
      right={
        <div className="flex gap-1 rounded-xl bg-black/30 p-1">
          {cuts.map((c) => (
            <button key={c} onClick={() => setCut(c)} className={`rounded-lg px-3 py-1 text-xs ${c === cut ? "bg-white/10 text-ink" : "text-muted"}`}>
              {c === "short" ? "Short" : "1-minute"}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {scenes.map((s, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line bg-black/30">
            <div className="relative aspect-video bg-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(job.id, `${stillDir}/scene-${String(i + 1).padStart(2, "0")}.jpg`)}
                onError={(e) => {
                  const sh = s.shot && shots[s.shot];
                  if (sh) (e.target as HTMLImageElement).src = fileUrl(job.id, sh.file);
                }}
                alt=""
                className={`h-full w-full ${cut === "short" ? "object-contain" : "object-cover"}`}
              />
              <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 font-mono text-[10px] text-white">
                {i + 1} · {s.type}
              </span>
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold" dangerouslySetInnerHTML={{ __html: s.headline.replace(/<a>/g, '<span class="text-accent">').replace(/<\/a>/g, "</span>").replace(/<(?!\/?span)[^>]+>/g, "") }} />
              <p className="mt-1 text-xs leading-relaxed text-muted">&ldquo;{s.say}&rdquo;</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Captured({ job }: { job: Job }) {
  const shots = job.capture!.shots.filter((s) => s.kind !== "fullpage");
  return (
    <Card title={`Captured ${job.input.kind === "expo" ? "screens" : "pages"}`} right={<span className="text-xs text-muted">{job.capture!.shots.length} screenshots</span>}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {shots.map((s) => (
          <figure key={s.id} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(job.id, s.file)} alt="" className={`rounded-xl border border-line object-cover object-top ${s.kind === "mobile" ? "h-64 w-[118px]" : "h-40 w-64"}`} />
            <figcaption className="mt-1.5 max-w-64 truncate text-xs text-muted">{s.title ?? s.id}</figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}

function Room({ job }: { job: Job }) {
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  // Keep the newest message in view by scrolling the room itself, never the page.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [job.messages.length]);
  const send = async () => {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await fetch(`/api/jobs/${job.id}/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
  };
  return (
    <aside className="glass flex h-[75vh] min-h-[520px] flex-col rounded-3xl lg:h-full lg:min-h-0">
      <div className="border-b border-line p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Crew room</h2>
          {job.bandRoomId ? <Pill tone="good">live on Band</Pill> : <Pill>local</Pill>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.roster.map((r) => (
            <span key={r} className="rise flex items-center gap-1.5 rounded-full border border-line bg-black/30 py-0.5 pr-2.5 pl-0.5 text-xs">
              <Avatar who={r} size={20} />
              {AGENTS[r]?.name}
            </span>
          ))}
        </div>
      </div>
      <div ref={list} className="flex-1 space-y-3 overflow-y-auto p-5">
        {job.messages.map((m) => (
          <Message key={m.id} m={m} jobId={job.id} />
        ))}
      </div>
      <div className="border-t border-line p-3">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message @Reel Director"
            className="h-11 flex-1 rounded-xl border border-line bg-black/40 px-4 text-sm outline-none focus:border-accent/60"
          />
          <button onClick={send} className="rounded-xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/15">Send</button>
        </div>
      </div>
    </aside>
  );
}

function Message({ m, jobId }: { m: CrewMessage; jobId: string }) {
  const who = AGENTS[m.from] ?? AGENTS.system;
  if (m.kind === "event") {
    const icon = { tool_call: "›", tool_result: "✓", thought: "…", error: "!", task: "+", attention: "!" }[m.eventType ?? "task"];
    return (
      <div className="rise flex gap-2 pl-1 text-xs text-muted">
        <span className="w-4 shrink-0 text-center font-mono" style={{ color: who.color }}>{icon}</span>
        <div className="min-w-0">
          <span style={{ color: who.color }}>{who.name}</span> <span className={m.eventType === "error" ? "text-bad" : m.eventType === "tool_call" ? "font-mono" : ""}>{m.text}</span>
          {m.images && m.images.length > 0 && (
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {m.images.slice(0, 8).map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f} src={fileUrl(jobId, f)} alt="" className="h-14 rounded-md border border-line" />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="rise flex gap-3">
      <Avatar who={m.from} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold" style={{ color: who.color }}>{who.name}</span>
          {m.verdict && <Pill tone={m.verdict === "APPROVED" ? "good" : "bad"}>{m.verdict}</Pill>}
          <span className="text-muted">{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        </div>
        <div className={`mt-1 rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-sm leading-relaxed ${m.verdict === "BLOCKED" ? "border-bad/30 bg-bad/5" : "border-line bg-black/30"}`}>
          {m.to.length > 0 && (
            <span className="mr-1.5">
              {m.to.map((t) => (
                <span key={t} className="mr-1 rounded-md px-1 py-0.5 text-xs font-semibold" style={{ background: `${(AGENTS[t] ?? AGENTS.system).color}22`, color: (AGENTS[t] ?? AGENTS.system).color }}>
                  @{t === "human" ? "you" : AGENTS[t]?.name}
                </span>
              ))}
            </span>
          )}
          {m.text}
        </div>
      </div>
    </div>
  );
}
