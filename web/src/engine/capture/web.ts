import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { browser, ctxDefaults, sleep } from "../media";
import type { Capture, Shot, Theme } from "../store";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

type Log = (text: string) => void;

/** Load a page and wait for it to settle, dismissing cookie banners. */
export async function settle(page: Page, url: string) {
  // Dev tooling (esbuild keepNames) can wrap evaluated functions in __name(); make that a no-op in the page.
  await page.addInitScript("window.__name = window.__name || function (f) { return f; }");
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    await page.goto(url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
  }
  // Browser error pages (flaky network): retry the navigation a couple of times.
  for (let i = 0; i < 2 && (page.url().startsWith("chrome-error:") || (await page.title().catch(() => "")) === ""); i++) {
    await sleep(1500);
    await page.goto(url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
  }
  if (page.url().startsWith("chrome-error:")) throw new Error(`Could not load ${url}`);
  await sleep(1200);
  // If stylesheets failed to load (flaky networks), reload once.
  const unstyled = await page
    .evaluate(() => document.querySelectorAll('link[rel="stylesheet"]').length > 0 && [...document.styleSheets].every((s) => { try { return s.cssRules.length === 0; } catch { return false; } }))
    .catch(() => false);
  if (unstyled) {
    await page.reload({ waitUntil: "load", timeout: 45000 }).catch(() => {});
    await sleep(1200);
  }
  for (const label of ["Accept all", "Accept", "I agree", "Agree", "Got it", "OK", "Allow all"]) {
    const btn = page.getByRole("button", { name: label, exact: true }).first();
    if (await btn.isVisible({ timeout: 200 }).catch(() => false)) {
      await btn.click({ timeout: 1000 }).catch(() => {});
      await sleep(400);
      break;
    }
  }
  // Scroll through once so lazy images and scroll-triggered reveals fire, then return to the top.
  await page
    .evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < Math.min(h, 9000); y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    })
    .catch(() => {});
  await sleep(900);
  await page.addStyleTag({ content: "*{caret-color:transparent!important}" }).catch(() => {});
}

/** Pull colors, fonts, copy and links out of the live page. */
export async function readPage(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    const hex = (c: { r: number; g: number; b: number }) =>
      "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const sat = (c: { r: number; g: number; b: number }) => {
      const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
      return mx === 0 ? 0 : (mx - mn) / mx;
    };
    let bg = parse(getComputedStyle(document.body).backgroundColor);
    if (!bg || bg.a < 0.1) bg = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (!bg || bg.a < 0.1) bg = { r: 255, g: 255, b: 255, a: 1 };
    const ink = parse(getComputedStyle(document.body).color) ?? { r: 20, g: 20, b: 20, a: 1 };

    // Accent: the most common saturated color among buttons and links.
    const counts = new Map<string, number>();
    document.querySelectorAll("a, button, [role=button], h1 span, h2 span").forEach((el) => {
      const cs = getComputedStyle(el);
      for (const v of [cs.backgroundColor, cs.color]) {
        const c = parse(v);
        // A usable accent is saturated and neither near-black nor near-white.
        const light = c ? (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 510 : 0;
        if (c && c.a > 0.5 && sat(c) > 0.35 && light > 0.2 && light < 0.85) counts.set(hex(c), (counts.get(hex(c)) ?? 0) + 1);
      }
    });
    const accents = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);

    const h1 = document.querySelector("h1");
    const font = (getComputedStyle(h1 ?? document.body).fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
    const meta = (n: string) =>
      document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content") ?? "";
    const icon =
      document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ||
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ||
      "";
    const links = [...document.querySelectorAll<HTMLAnchorElement>("header a, nav a, a")]
      .map((a) => ({ href: a.href.split("#")[0], text: (a.innerText || "").trim().slice(0, 40) }))
      .filter((l) => l.href.startsWith(location.origin) && l.text);
    const headings = [...document.querySelectorAll("h1, h2, h3")].map((h) => (h as HTMLElement).innerText.trim()).filter(Boolean);
    return {
      title: document.title,
      description: meta("description") || meta("og:description"),
      ogTitle: meta("og:title"),
      siteName: meta("og:site_name") || meta("application-name"),
      icon,
      bg: hex(bg),
      ink: hex(ink),
      accents,
      font,
      headings: headings.slice(0, 30),
      text: document.body.innerText.replace(/\s+\n/g, "\n").replace(/\n{2,}/g, "\n").slice(0, 7000),
      links,
      height: document.documentElement.scrollHeight,
    };
  });
}

export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v + amt * 255))));
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function makeTheme(bg: string, ink: string, accents: string[], font: string): Theme {
  const dark = luminance(bg) < 0.35;
  const accent = accents[0] ?? (dark ? "#7c9cff" : "#4f46e5");
  const accent2 = accents.find((a) => a !== accent) ?? (dark ? "#f5b94a" : "#f97316");
  return {
    mode: dark ? "dark" : "light",
    bg,
    bg2: shade(bg, dark ? 0.06 : -0.05),
    ink: Math.abs(luminance(ink) - luminance(bg)) > 0.3 ? ink : dark ? "#ffffff" : "#111111",
    muted: dark ? "#a7abc0" : "#5b6070",
    accent,
    accent2,
    font: font || "Inter",
  };
}

async function shoot(page: Page, dir: string, id: string, kind: Shot["kind"], extra: Partial<Shot> = {}): Promise<Shot> {
  const file = `shots/${id}.jpg`;
  const size = page.viewportSize()!;
  let height = size.height;
  if (kind === "fullpage") {
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    height = Math.min(full, 7000);
    await page.screenshot({ path: path.join(dir, file), type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: size.width, height } });
  } else {
    await page.screenshot({ path: path.join(dir, file), type: "jpeg", quality: 90 });
  }
  const scale = kind === "mobile" ? 3 : 1.5;
  return { id, file, kind, width: Math.round(size.width * scale), height: Math.round(height * scale), ...extra };
}

async function saveIcon(ctx: BrowserContext, dir: string, url: string): Promise<string | undefined> {
  if (!url) return;
  try {
    const res = await ctx.request.get(url, { timeout: 10000 });
    if (!res.ok()) return;
    const type = res.headers()["content-type"] ?? "";
    const ext = type.includes("svg") ? ".svg" : type.includes("png") ? ".png" : type.includes("jpeg") ? ".jpg" : type.includes("icon") ? ".ico" : ".png";
    if (ext === ".ico") return;
    const file = `icon${ext}`;
    fs.writeFileSync(path.join(dir, file), await res.body());
    return file;
  } catch {
    return;
  }
}

export async function captureWebsite(url: string, dir: string, log: Log, opts: { maxPages?: number } = {}): Promise<Capture> {
  fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
  const b = await browser();
  const desk = await b.newContext({ ...ctxDefaults(), viewport: DESKTOP, deviceScaleFactor: 1.5 });
  const shots: Shot[] = [];
  try {
    const page = await desk.newPage();
    log(`Opening ${url}`);
    await settle(page, url);
    const info = await readPage(page);
    shots.push(await shoot(page, dir, "home", "desktop", { title: "Home", url: page.url() }));
    shots.push(await shoot(page, dir, "home-full", "fullpage", { title: "Full landing page", url: page.url() }));
    log(`Captured the landing page (${info.height}px tall).`);

    // Visit a few in-site pages from the nav.
    const seen = new Set([new URL(page.url()).pathname]);
    const candidates = info.links.filter((l) => {
      const p = new URL(l.href).pathname;
      if (seen.has(p) || /\.(pdf|zip|png|jpg)$/i.test(p) || /login|signin|sign-in|signup|privacy|terms|legal|cookie/i.test(p)) return false;
      seen.add(p);
      return true;
    });
    let n = 0;
    for (const l of candidates.slice(0, (opts.maxPages ?? 4) * 2)) {
      if (n >= (opts.maxPages ?? 4)) break;
      try {
        await settle(page, l.href);
        const title = (await page.title()) || l.text;
        shots.push(await shoot(page, dir, `page-${++n}`, "desktop", { title: l.text || title, url: page.url() }));
        log(`Captured "${l.text}".`);
      } catch {
        /* skip pages that fail to load */
      }
    }

    const mctx = await b.newContext({ ...ctxDefaults(), viewport: MOBILE, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    try {
      const m = await mctx.newPage();
      await settle(m, url);
      shots.push(await shoot(m, dir, "mobile-home", "mobile", { title: "On a phone", url }));
      log("Captured the mobile layout.");
    } finally {
      await mctx.close();
    }

    const iconFile = await saveIcon(desk, dir, info.icon);
    const name = (info.siteName || info.ogTitle || info.title || new URL(url).hostname).split(/[|\-:·]/)[0].trim();
    return {
      name,
      tagline: info.headings[0],
      description: info.description,
      url,
      iconFile,
      theme: makeTheme(info.bg, info.ink, info.accents, info.font),
      shots,
      text: [`TITLE: ${info.title}`, `DESCRIPTION: ${info.description}`, `HEADINGS: ${info.headings.join(" | ")}`, info.text].join("\n").slice(0, 9000),
    };
  } finally {
    await desk.close();
  }
}
