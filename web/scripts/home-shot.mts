// Screenshot of the home page with a URL typed in, for the pitch video: tsx scripts/home-shot.mts <out.jpg> [url]
import { chromium } from "playwright";

const [out, url = "https://convert.chinesepowered.com"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
for (let i = 0; i < 30; i++) {
  if (await p.goto("http://localhost:3000/", { waitUntil: "load" }).then(() => true, () => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await p.waitForTimeout(1500);
await p.locator("input[required]").fill(url);
await p.screenshot({ path: out, type: "jpeg", quality: 90 });
await b.close();
