import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { render } from "./config";

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const FFMPEG: string = process.env.FFMPEG_PATH || require("ffmpeg-static");
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const FFPROBE: string = process.env.FFPROBE_PATH || require("ffprobe-static").path;

/** A path relative to `from`, always with forward slashes (stored in job files and used in URLs). */
export const relPosix = (from: string, to: string) => path.relative(from, to).split(path.sep).join("/");

/**
 * On Windows, npm and npx are .cmd shims that Node can only start through a shell.
 * Only these fixed tool names get a shell; commands that take user input (git, ffmpeg) never do.
 */
const NEEDS_SHELL = /^(npm|npx|pnpm)$/;

/** Run a command, reject with its stderr tail on failure. */
export function run(cmd: string, args: string[], opts: { cwd?: string; input?: Buffer; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<string>((resolve, reject) => {
    const shell = process.platform === "win32" && NEEDS_SHELL.test(cmd);
    const p = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, shell, windowsHide: true });
    let out = "";
    let err = "";
    const timer = opts.timeoutMs ? setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs) : null;
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(cmd)} ${args.slice(0, 3).join(" ")} exited ${code}: ${err.slice(-1500)}`));
    });
    if (opts.input) p.stdin.end(opts.input);
  });
}

export async function audioDuration(file: string): Promise<number> {
  const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return parseFloat(out.trim()) || 0;
}

/** Downscale an image to a JPEG data URL small enough for a vision model. */
export async function imageDataURL(file: string, maxW = 1024, maxH = 1600): Promise<string> {
  const out = path.join(path.dirname(file), `.llm-${path.basename(file, path.extname(file))}.jpg`);
  if (!fs.existsSync(out)) {
    await run(FFMPEG, [
      "-y", "-loglevel", "error", "-i", file,
      "-vf", `scale='min(${maxW},iw)':'min(${maxH},ih)':force_original_aspect_ratio=decrease`,
      "-q:v", "4", out,
    ]);
  }
  return `data:image/jpeg;base64,${fs.readFileSync(out).toString("base64")}`;
}

let browserP: Promise<Browser> | null = null;
export function browser(): Promise<Browser> {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  browserP ??= chromium
    .launch({
      executablePath: render.chromium || undefined,
      // Behind a corporate/sandbox proxy, route Chromium through it too (local asset servers bypass it).
      proxy: proxy ? { server: proxy } : undefined,
      args: ["--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
    })
    .catch((e) => {
      browserP = null;
      throw e;
    });
  return browserP;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".map": "application/json", ".txt": "text/plain",
};

/**
 * Serve local folders to a browser context under a fake origin, without opening a port.
 * Requests are answered in-process with route.fulfill, so this works behind any proxy.
 * `mounts` maps URL prefixes to folders. With `spa`, unknown paths fall back to index.html.
 */
export const LOCAL_ORIGIN = "http://reel.local";
export async function mount(ctx: BrowserContext, mounts: Record<string, string>, opts: { spa?: boolean } = {}) {
  const entries = Object.entries(mounts).sort((a, b) => b[0].length - a[0].length);
  await ctx.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    const url = decodeURIComponent(new URL(route.request().url()).pathname);
    for (const [prefix, dir] of entries) {
      if (!url.startsWith(prefix)) continue;
      const root = path.resolve(dir);
      let file = path.join(root, url.slice(prefix.length));
      if (!file.startsWith(root)) break;
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
      if (!fs.existsSync(file) && opts.spa && !path.extname(file)) file = path.join(root, "index.html");
      if (!fs.existsSync(file)) break;
      return route.fulfill({
        status: 200,
        body: fs.readFileSync(file),
        headers: { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" },
      });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });
  return LOCAL_ORIGIN;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Context defaults. A TLS-intercepting proxy (sandboxes, corporate networks) needs cert errors ignored. */
export const ctxDefaults = () => ({ ignoreHTTPSErrors: !!(process.env.HTTPS_PROXY || process.env.https_proxy) });
