// Screenshot app pages (for docs and the pitch video): tsx scripts/shot.mts <url> <out.png> [width] [height] [fullPage]
import { chromium } from "playwright";
const [url, out, w = "1600", h = "1000", full] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 })).newPage();
await p.goto(url, { waitUntil: "load" });
await p.waitForTimeout(2500);
await p.screenshot({ path: out, fullPage: !!full });
await b.close();
