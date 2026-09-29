// Smoke test: capture a site, render stills and a short narrated clip with a hand-written storyboard.

import path from "node:path";
import { captureWebsite } from "../src/engine/capture/web";
import { renderStills, renderVideo } from "../src/engine/render";
import type { Scene } from "../src/engine/storyboard";

const url = process.argv[2] ?? "https://www.crusoe.ai";
const dir = path.resolve(".data/smoke");
const cap = await captureWebsite(url, dir, (t) => console.log("  ", t), { maxPages: 2 });
console.log(cap.name, cap.theme, cap.shots.map((s) => s.id));
const scenes: Scene[] = [
  { type: "hook", headline: `Meet <a>${cap.name}</a>`, sub: cap.description?.slice(0, 80), say: `This is ${cap.name}.`, shot: "home" },
  { type: "feature", kicker: "Feature", headline: "Your whole site, <a>at a glance</a>", sub: "Scrolling the landing page", bullets: ["Fast", "Clear"], say: "", shot: "page-1", focus: { x: 0.3, y: 0.3, scale: 1.4 } },
  { type: "landing", headline: "The full <a>landing page</a>", say: "", shot: "home-full" },
  { type: "feature", headline: "Looks great <a>on mobile</a>", say: "", shot: "mobile-home" },
  { type: "end", headline: cap.name, sub: "Try it today", cta: new URL(url).hostname, say: "Try it today." },
];
const base = { assetsDir: dir, scenes, theme: cap.theme, name: cap.name, url, icon: cap.iconFile, shots: cap.shots };
const stills = await renderStills({ ...base, w: 1920, h: 1080 }, path.join(dir, "stills"));
await renderStills({ ...base, w: 1080, h: 1920 }, path.join(dir, "stills-v"));
console.log("stills", stills.length);
const t0 = Date.now();
const out = await renderVideo({ ...base, w: 1920, h: 1080 }, path.join(dir, "out/main"), (s, p) => process.stdout.write(`\r${s} ${(p * 100).toFixed(0)}%   `));
console.log("\nvideo", out.video, out.duration.toFixed(1), "s in", ((Date.now() - t0) / 1000).toFixed(0), "s");
process.exit(0);
