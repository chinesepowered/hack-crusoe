import { CreateForm } from "@/components/CreateForm";
import { RecentJobs } from "@/components/RecentJobs";
import { AGENTS, Avatar, Logo } from "@/components/ui";
import { band, llm } from "@/engine/config";

export const dynamic = "force-dynamic";

const STEPS = [
  { who: "director", title: "Direct", text: "Reads the request and recruits the right scout for a website or an Expo app." },
  { who: "web_scout", title: "Capture", text: "Opens the product in a real browser, taps through screens, reads them with a vision model." },
  { who: "writer", title: "Write", text: "Turns the brief into scenes, voiceover, captions and YouTube copy for each cut." },
  { who: "critic", title: "Critique", text: "Looks at real rendered frames and blocks anything unreadable or unsupported." },
  { who: "producer", title: "Produce", text: "Narrates, renders every frame, mixes music and masters for YouTube." },
];

export default function Home() {
  const bandOn = band.enabled && Object.keys(band.agents).length >= 5;
  return (
    <main className="grain relative flex-1 overflow-hidden">
      <div className="aurora" />
      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <nav className="flex items-center justify-between py-6">
          <Logo />
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="hidden rounded-full border border-line px-3 py-1 sm:inline">
              Models on <span className="text-ink">{llm.provider}</span>
            </span>
            <span className="rounded-full border border-line px-3 py-1">
              Crew room: <span className={bandOn ? "text-good" : "text-ink"}>{bandOn ? "Band (live)" : "local"}</span>
            </span>
          </div>
        </nav>

        <section className="mx-auto mt-14 max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-white/5 px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-good" /> Websites and Expo React Native apps
          </div>
          <h1 className="text-5xl leading-[1.02] font-semibold tracking-tight sm:text-7xl">
            Your launch video,
            <br />
            <span className="font-serif font-normal italic gradient-text">made by a crew of agents.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
            Paste a URL or an Expo repo. Five agents capture your real product, write the script, critique every frame and hand you a YouTube Short and a 1-minute promo, ready to post.
          </p>
        </section>

        <div className="mx-auto mt-12 max-w-2xl">
          <CreateForm />
        </div>

        <section className="mt-24">
          <h2 className="mb-5 text-sm font-medium tracking-wide text-muted uppercase">The crew</h2>
          <div className="grid gap-3 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <div key={s.who} className="glass rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <Avatar who={s.who} />
                  <div>
                    <div className="font-mono text-[11px] text-muted">0{i + 1}</div>
                    <div className="text-sm font-semibold">{AGENTS[s.who].name}</div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <RecentJobs />
      </div>
    </main>
  );
}
