// Renders the 3-minute pitch video with LaunchReel's own engine: pnpm pitch
import path from "node:path";
import { renderVideo } from "../src/engine/render";
import type { Scene } from "../src/engine/storyboard";
import type { Shot } from "../src/engine/store";

const dir = path.resolve("../pitch/assets");
const shot = (id: string, kind: Shot["kind"], width: number, height: number, url = "localhost:3000"): Shot => ({ id, file: `${id}.jpg`, kind, width, height, url });
const shots: Shot[] = [
  shot("ui-home-filled", "desktop", 2160, 1350),
  shot("ui-job", "desktop", 2160, 1350, "localhost:3000/jobs/qmnbyfzqez"),
  shot("ui-storyboard", "desktop", 1332, 917, "localhost:3000/jobs/qmnbyfzqez"),
  shot("ui-room-full", "fullpage", 660, 8060, "Crew room, live on Band"),
  shot("ui-room", "desktop", 660, 1142, "Crew room, live on Band"),
  shot("ui-outputs", "desktop", 1332, 1394, "localhost:3000/jobs/qmnbyfzqez"),
  shot("main-4", "desktop", 1920, 1080, "main.mp4"),
  shot("main-26", "desktop", 1920, 1080, "main.mp4"),
  shot("short-3", "mobile", 1080, 1920),
  shot("short-15", "mobile", 1080, 1920),
  shot("short-30", "mobile", 1080, 1920),
];

const scenes: Scene[] = [
  { type: "hook", headline: "Every app needs a <a>launch video</a>", sub: "Almost none of them get one.", say: "Every app needs a launch video. Almost none of them get one." },
  {
    type: "stat", value: "1 weekend", headline: "or <a>nothing at all</a>",
    say: "Small teams ship a product in days. Then they either lose a weekend in a video editor, recording screens, writing a script and cutting two aspect ratios, or they post nothing. No video means no YouTube Short, no Play Store promo, and a launch nobody sees.",
  },
  {
    type: "hook", headline: "Meet <a>LaunchReel</a>", sub: "Paste a link. Get launch videos.", shot: "ui-home-filled",
    say: "Meet LaunchReel. Paste a website, or an Expo React Native repo, and a crew of five AI agents turns your real product into YouTube ready launch videos.",
  },
  {
    type: "steps", headline: "A crew, <a>not a prompt</a>",
    steps: ["Scouts capture the <a>real product</a>", "A writer and a critic argue over <a>every frame</a>", "A producer narrates, renders and <a>masters</a>"],
    say: "It works like a tiny production studio. Scouts capture the product, a writer and a critic argue over every frame, and a producer delivers the final cut.",
  },
  {
    type: "feature", kicker: "01 Direct and capture", headline: "The right scout, <a>recruited live</a>", shot: "ui-job",
    bullets: ["Websites in real Chromium", "Expo apps exported for web", "Qwen 3.8 reads every screen"],
    say: "The Reel Director reads your request and recruits the right specialist at runtime. The Web Scout opens a site in a real browser. The App Scout builds an Expo app for the web and taps through every screen. Then Qwen 3.8, running on Crusoe, reads the screenshots and works out what the product actually does.",
  },
  {
    type: "feature", kicker: "02 Write", headline: "Scenes, voice, <a>YouTube copy</a>", shot: "ui-storyboard",
    say: "The Storyboard Writer turns that brief into scenes, voiceover, captions, and YouTube titles, descriptions and tags, for a vertical Short and a one minute promo.",
  },
  {
    type: "feature", kicker: "03 Critique", headline: "A critic that <a>can say no</a>", sub: "It reviews real rendered frames, not JSON.", shot: "ui-room-full",
    say: "Then comes our favorite part. The Frame Critic looks at real rendered frames, and blocks anything unreadable, any screenshot that does not match the claim, and any number that is not in the source. On this run it blocked twice, once for a browser error page our capture had missed, and the writer had to fix it.",
  },
  {
    type: "feature", kicker: "04 Approve", headline: "You get the <a>final say</a>", shot: "ui-room",
    say: "When the critic signs off, the Director asks you. Approve in one click, or ask for changes in plain English, and the crew goes around again.",
  },
  {
    type: "grid", headline: "Real videos, <a>ready to post</a>", shots: ["short-3", "short-15", "short-30"],
    say: "The Producer narrates with ElevenLabs, renders every frame deterministically, mixes an original music bed that ducks under the voice, and masters to YouTube loudness.",
  },
  {
    type: "feature", kicker: "05 Ship", headline: "Short, promo, <a>and the copy</a>", shot: "ui-outputs",
    bullets: ["9:16 Short and 16:9 promo", "Captions and a thumbnail", "Title, description, tags"],
    say: "You get a vertical Short, a one minute promo, captions, a thumbnail, and copy you can paste straight into YouTube Studio.",
  },
  {
    type: "stat", value: "~80k", headline: "tokens for a <a>full launch</a>", sub: "Open models on Crusoe",
    say: "The whole crew runs on open models on Crusoe. DeepSeek V4 Flash plans, GLM 5.3 writes, and Qwen 3.8 sees. A full launch, two videos with two critic rounds, is about eighty thousand tokens.",
  },
  {
    type: "feature", kicker: "Coordinated in Band", headline: "Every handoff is <a>real</a>", shot: "ui-room",
    bullets: ["Six agents, one room per job", "Handoffs are @mentions", "Critic veto and human gate"],
    say: "Band is the room. Every agent is its own Band identity, every handoff is a mention, the scout is recruited mid conversation, and the critic's veto and your approval both happen in the room. Take Band away, and no agent ever receives work.",
  },
  { type: "quote", headline: "This video was rendered by <a>LaunchReel</a>.", who: "Same engine. Same voice.", say: "And yes, this pitch video was rendered by LaunchReel's own engine." },
  { type: "end", headline: "LaunchReel", sub: "Paste a link. Post a launch.", cta: "Built on Crusoe and Band", say: "LaunchReel. Paste a link, post a launch." },
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
    music: { bpm: 100, seed: 3, mood: "calm" },
  },
  path.resolve("../pitch/launchreel-pitch"),
  (s, p) => process.stdout.write(`\r${s} ${(p * 100).toFixed(0)}%    `),
);
console.log(`\n${res.video} ${res.duration.toFixed(1)}s`);
process.exit(0);
