// Renders minutes 2 and 3 of the demo video (problem, solution, a real run) with LaunchReel's own engine: pnpm exec tsx --env-file=.env.local scripts/pitch-v2.mts
// Minute 1 is a sample promo that gets joined in front of this file separately.
import path from "node:path";
import { renderVideo } from "../src/engine/render";
import type { Scene } from "../src/engine/storyboard";
import type { Shot } from "../src/engine/store";

const dir = path.resolve("../pitch/assets");
const shot = (id: string, kind: Shot["kind"], width: number, height: number, url = "localhost:3000"): Shot => ({ id, file: `${id}.jpg`, kind, width, height, url });
const job = "localhost:3000/jobs/qmnbyfzqez";
const shots: Shot[] = [
  shot("ui-home-v2", "desktop", 2160, 1350),
  shot("ui-job", "desktop", 2160, 1350, job),
  shot("ui-room-full", "fullpage", 660, 8060, "Crew room, live on Band"),
  shot("ui-room", "desktop", 660, 1142, "Crew room, live on Band"),
  shot("short-3", "mobile", 1080, 1920),
  shot("short-15", "mobile", 1080, 1920),
  shot("short-30", "mobile", 1080, 1920),
];

const scenes: Scene[] = [
  // Minute 2: the problem and the solution.
  { type: "hook", headline: "Everyone vibe codes <a>apps now</a>", sub: "It's 2026.", say: "In 2026, anyone can vibe code an app over a weekend. So everyone does." },
  {
    type: "stat", value: "0", headline: "is the <a>median user base</a>", sub: "Building got easy. Getting found did not.",
    say: "But the median user base is still zero. Building stopped being the hard part. Getting found is.",
  },
  {
    type: "steps", headline: "Marketing is the <a>missing half</a>",
    steps: ["A script and <a>screen captures</a>", "A voiceover and <a>an edit</a>", "Posts on <a>every channel</a>"],
    say: "Apps get found through marketing: short videos, store previews, launch posts. That takes scripts, screen captures, voiceovers and edits, so most makers skip it, and nobody ever sees the app.",
  },
  {
    type: "hook", headline: "Meet <a>LaunchReel</a>", sub: "An end-to-end marketing team, made of agents.", shot: "ui-home-v2",
    say: "LaunchReel is an end to end marketing team for vibe coders. Paste your website or your Expo project, and a crew of AI agents markets your real product for you.",
  },
  {
    type: "steps", headline: "Starting with the <a>bread and butter</a>",
    steps: ["<a>Today:</a> YouTube Shorts and 1-minute promos", "<a>Next:</a> more promo formats", "<a>Then:</a> posting to LinkedIn and beyond"],
    say: "We start with the bread and butter: marketing videos. One link in, a YouTube Short and a one minute promo out. Next come more promo formats, then posting them to LinkedIn and every other channel for you.",
  },
  // Minute 3: a real run.
  {
    type: "feature", kicker: "A real run", headline: "The right scout, <a>recruited live</a>", shot: "ui-job",
    bullets: ["Real Chromium browser", "Expo apps built for web", "Qwen reads every screen"],
    say: "Here's a real run on our Convert app. The Director reads the link and recruits the right scout on the spot. The Web Scout opens the site in a real browser, and Qwen reads every screen.",
  },
  {
    type: "feature", kicker: "Critique", headline: "A critic that <a>can say no</a>", sub: "It reviews real rendered frames, not JSON.", shot: "ui-room-full",
    say: "The Writer drafts scenes, voiceover and YouTube copy. The Frame Critic reviews the real rendered frames and blocks anything unreadable or untrue. On this run it blocked two drafts, one for a blank browser window, and the Writer reworked them.",
  },
  {
    type: "feature", kicker: "Approve", headline: "You get the <a>final say</a>", shot: "ui-room",
    say: "Nothing renders until you approve it, right in the Band room. Then the Producer narrates, renders every frame and masters it for YouTube.",
  },
  {
    type: "grid", headline: "Ready to <a>post</a>", shots: ["short-3", "short-15", "short-30"],
    say: "Out comes a Short and a one minute promo, with captions, a thumbnail and copy ready for YouTube Studio.",
  },
  {
    type: "steps", headline: "Built on <a>Crusoe</a> and <a>Band</a>",
    steps: ["<a>Crusoe:</a> DeepSeek plans, GLM writes, Qwen sees", "<a>Band:</a> six agents, one room, a real veto", "<a>You:</a> the final approval"],
    say: "The models run on Crusoe: DeepSeek plans, GLM writes and Qwen sees. Band is the room where six agents hand off work, veto drafts and wait for your OK.",
  },
  { type: "end", headline: "LaunchReel", sub: "You built the app. Now get it seen.", cta: "Built on Crusoe and Band", say: "LaunchReel. You built the app. Now get it seen." },
];

const res = await renderVideo(
  {
    assetsDir: dir,
    scenes,
    w: 1920,
    h: 1080,
    theme: { mode: "dark", bg: "#0b0a12", bg2: "#171330", ink: "#ffffff", muted: "#a7a7bd", accent: "#a78bfa", accent2: "#f472b6", font: "Inter" },
    name: "LaunchReel",
    icon: "icon.svg",
    shots,
    music: { bpm: 100, seed: 5, mood: "calm" },
  },
  path.resolve("../pitch/launchreel-pitch-v2"),
  (s, p) => process.stdout.write(`\r${s} ${(p * 100).toFixed(0)}%    `),
);
console.log(`\n${res.video} ${res.duration.toFixed(1)}s`);
for (const s of res.scenes) console.log(`${s.start.toFixed(1)}s ${s.type} ${s.headline.replace(/<[^>]+>/g, "")}`);
process.exit(0);
