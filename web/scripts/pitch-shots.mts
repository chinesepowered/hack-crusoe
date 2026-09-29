// Screenshots of the running app for the pitch video: tsx scripts/pitch-shots.mts <jobId>
import path from "node:path";
import { chromium } from "playwright";
const id = process.argv[2];
const out = path.resolve("../pitch/assets");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "load" });
await p.waitForTimeout(2000);
await p.screenshot({ path: `${out}/ui-home.jpg`, type: "jpeg", quality: 90 });
await p.locator("input").first().fill("https://convert.chinesepowered.com");
await p.screenshot({ path: `${out}/ui-home-filled.jpg`, type: "jpeg", quality: 90 });
await p.goto(`http://localhost:3000/jobs/${id}`, { waitUntil: "load" });
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/ui-job.jpg`, type: "jpeg", quality: 90 });
await p.locator("aside").screenshot({ path: `${out}/ui-room.jpg`, type: "jpeg", quality: 90 });
// Full crew room history, as one tall image (scrolled in the video).
await p.evaluate(() => {
  const a = document.querySelector("aside") as HTMLElement;
  a.style.height = "auto";
  a.style.maxHeight = "none";
  (a.children[1] as HTMLElement).style.overflow = "visible";
});
await p.locator("aside").screenshot({ path: `${out}/ui-room-full.jpg`, type: "jpeg", quality: 88 });
for (const [title, file] of [["Storyboard", "ui-storyboard"], ["Ready to post", "ui-outputs"], ["Captured", "ui-captured"]]) {
  const sec = p.locator("section", { hasText: title }).first();
  if (await sec.count()) await sec.screenshot({ path: `${out}/${file}.jpg`, type: "jpeg", quality: 90 });
}
await b.close();
