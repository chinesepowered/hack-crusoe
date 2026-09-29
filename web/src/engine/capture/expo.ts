import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { browser, ctxDefaults, mount, run, sleep } from "../media";
import type { Capture, Shot } from "../store";
import { makeTheme, readPage, settle } from "./web";

type Log = (text: string) => void;
const MOBILE = { width: 390, height: 844 };
const SKIP = new Set(["node_modules", ".git", ".expo", "dist", "dist-web", "web-build", "ios", "android", ".turbo"]);

/** Get the Expo project into the job folder (clone a git URL or copy a local folder). */
async function fetchSource(target: string, dest: string, log: Log) {
  if (/^(https?:\/\/|git@)/.test(target)) {
    log(`Cloning ${target}`);
    await run("git", ["clone", "--depth", "1", target, dest], { timeoutMs: 180000 });
  } else {
    const src = path.resolve(target.replace(/^~(?=[\\/]|$)/, os.homedir()));
    if (!fs.existsSync(path.join(src, "package.json"))) throw new Error(`No package.json found at ${src}.`);
    log(`Copying ${src}`);
    // Never copy secrets: skip .env files along with build output and dependencies.
    fs.cpSync(src, dest, { recursive: true, filter: (p) => !SKIP.has(path.basename(p)) && !/^\.env/.test(path.basename(p)) });
  }
}

function readJSON(file: string) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** Look for store screenshots already in the repo, for when the web export is not possible. */
function repoScreenshots(src: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 5 || found.length > 12) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(png|jpe?g)$/i.test(e.name) && /screenshot|store|phone|preview|metadata/i.test(p)) found.push(p);
    }
  };
  walk(src, 0);
  return found;
}

export async function captureExpo(target: string, dir: string, log: Log): Promise<Capture> {
  const src = path.join(dir, "src");
  fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
  if (!fs.existsSync(src)) await fetchSource(target, src, log);

  const pkg = readJSON(path.join(src, "package.json")) ?? {};
  const appJson = readJSON(path.join(src, "app.json"))?.expo ?? {};
  const name: string = appJson.name ?? pkg.name ?? "App";
  const readme = ["README.md", "readme.md"].map((f) => path.join(src, f)).find((f) => fs.existsSync(f));
  const readmeText = readme ? fs.readFileSync(readme, "utf8").slice(0, 5000) : "";

  let iconFile: string | undefined;
  if (appJson.icon && fs.existsSync(path.join(src, appJson.icon))) {
    iconFile = "icon" + path.extname(appJson.icon);
    fs.copyFileSync(path.join(src, appJson.icon), path.join(dir, iconFile));
  }

  const shots: Shot[] = [];
  let pageInfo: Awaited<ReturnType<typeof readPage>> | undefined;
  try {
    // Expo apps use npm (not pnpm), per the project rules.
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    log("Installing dependencies with npm (this can take a few minutes).");
    await run("npm", ["install", "--no-audit", "--no-fund", "--legacy-peer-deps"], { cwd: src, timeoutMs: 600000 });
    const missing = ["react-native-web", "react-dom", "@expo/metro-runtime"].filter((d) => !deps[d]);
    if (missing.length) {
      log(`Adding web support: ${missing.join(", ")}`);
      await run("npx", ["expo", "install", ...missing, "--", "--legacy-peer-deps"], { cwd: src, timeoutMs: 300000 });
    }
    log("Exporting the app for web with expo export.");
    await run("npx", ["expo", "export", "--platform", "web", "--output-dir", "dist-web"], {
      cwd: src,
      timeoutMs: 600000,
      env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
    });

    const b = await browser();
    const ctx = await b.newContext({ ...ctxDefaults(), viewport: MOBILE, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const server = { origin: await mount(ctx, { "/": path.join(src, "dist-web") }, { spa: true }) };
    try {
      const page = await ctx.newPage();
      await settle(page, server.origin + "/");
      await sleep(1500);
      pageInfo = await readPage(page);
      const seen = new Set<string>();
      const snap = async (title: string) => {
        const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
        const hash = crypto.createHash("md5").update(text).digest("hex");
        if (seen.has(hash) || text.trim().length < 3) return false;
        seen.add(hash);
        const id = `screen-${shots.length + 1}`;
        const file = `shots/${id}.jpg`;
        await page.screenshot({ path: path.join(dir, file), type: "jpeg", quality: 90 });
        shots.push({ id, file, kind: "mobile", width: MOBILE.width * 3, height: MOBILE.height * 3, title: title || `Screen ${shots.length + 1}` });
        log(`Captured screen "${title}".`);
        return true;
      };
      await snap("Home");

      // Tap through tabs, links and buttons, keeping each screen that looks new.
      const labels: string[] = await page.evaluate(() => {
        const els = [...document.querySelectorAll<HTMLElement>('[role="tab"], [role="link"], a[href], [role="button"], button')];
        return [...new Set(els.filter((e) => e.offsetParent !== null).map((e) => (e.innerText || e.getAttribute("aria-label") || "").trim()).filter((t) => t && t.length < 30))];
      });
      for (const label of labels.slice(0, 14)) {
        if (shots.length >= 7) break;
        try {
          await page.getByText(label, { exact: true }).first().click({ timeout: 2000 });
          await sleep(1200);
          await snap(label);
          if (!page.url().startsWith(server.origin)) await settle(page, server.origin + "/");
        } catch {
          /* not clickable */
        }
      }
    } finally {
      await ctx.close();
    }
  } catch (e) {
    log(`Web export did not work (${(e as Error).message.split("\n")[0].slice(0, 160)}). Falling back to screenshots in the repo.`);
  }

  if (shots.length < 2) {
    for (const f of repoScreenshots(src).slice(0, 8)) {
      const id = `screen-${shots.length + 1}`;
      const file = `shots/${id}${path.extname(f).toLowerCase()}`;
      fs.copyFileSync(f, path.join(dir, file));
      shots.push({ id, file, kind: "mobile", width: 1170, height: 2532, title: path.basename(f) });
    }
  }
  if (!shots.length) throw new Error("Could not capture any screens: the web export failed and the repo has no screenshots.");

  const primary = appJson.primaryColor ?? appJson.splash?.backgroundColor;
  const theme = pageInfo
    ? makeTheme(pageInfo.bg, pageInfo.ink, [primary, ...pageInfo.accents].filter(Boolean), pageInfo.font)
    : makeTheme(appJson.userInterfaceStyle === "dark" ? "#0e0f14" : "#ffffff", "#111111", [primary].filter(Boolean), "Inter");

  return {
    name,
    tagline: pkg.description,
    description: pkg.description ?? readmeText.split("\n").find((l) => l.trim() && !l.startsWith("#")),
    iconFile,
    theme,
    shots,
    text: [`APP NAME: ${name}`, `PACKAGE DESCRIPTION: ${pkg.description ?? ""}`, `README:\n${readmeText}`, pageInfo ? `VISIBLE TEXT:\n${pageInfo.text}` : ""].join("\n").slice(0, 9000),
  };
}
