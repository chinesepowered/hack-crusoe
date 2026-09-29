import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { PLAYER_DIR, render as cfg } from "./config";
import { browser, ctxDefaults, FFMPEG, mount, run } from "./media";
import { makeMusic } from "./music";
import { ensureFont, FONT_DIR } from "./fonts";
import { speak } from "./narrate";
import { timeline, XFADE, type Scene, type TimedScene } from "./storyboard";
import type { Shot, Theme } from "./store";

export type RenderSpec = {
  /** Folder that shot files and the icon are relative to. */
  assetsDir: string;
  scenes: Scene[];
  w: number;
  h: number;
  theme: Theme & { display?: string };
  name: string;
  url?: string;
  icon?: string;
  shots: Shot[];
  captions?: boolean;
  voiceId?: string;
  music?: { bpm?: number; seed?: number; mood?: "bright" | "calm" };
};

type Progress = (stage: string, p: number) => void;

async function openPlayer(spec: RenderSpec, scenes: TimedScene[], duration: number) {
  const b = await browser();
  const ctx = await b.newContext({ ...ctxDefaults(), viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: 1 });
  const origin = await mount(ctx, { "/player/": PLAYER_DIR, "/assets/": spec.assetsDir, "/fonts/": FONT_DIR });
  // Use the product's own font when it is a Google Font; otherwise fall back to Inter.
  const theme = { ...spec.theme };
  const fontCss = [await ensureFont("Inter")];
  for (const k of ["font", "display"] as const) {
    const f = theme[k];
    if (!f || f === "Inter") continue;
    const css = await ensureFont(f);
    if (css) fontCss.push(css);
    else theme[k] = "Inter";
  }
  const page = await ctx.newPage();
  const data = {
    w: spec.w, h: spec.h, xfade: XFADE, duration, theme, name: spec.name, url: spec.url,
    icon: spec.icon, assets: "/assets/", captions: spec.captions ?? true, fontCss: fontCss.filter(Boolean), fontsBase: "/fonts/",
    shots: Object.fromEntries(spec.shots.map((s) => [s.id, s])),
    scenes,
  };
  await page.addInitScript((d) => ((window as unknown as { __DATA: unknown }).__DATA = d), data);
  await page.goto(`${origin}/player/player.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => (window as unknown as { ready: Promise<boolean> }).ready);
  const close = async () => {
    await ctx.close();
  };
  return { page, close };
}

/** Quick contact sheet: one still per scene, using estimated timings (no narration spend). */
export async function renderStills(spec: RenderSpec, outDir: string): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const { scenes, duration } = timeline(spec.scenes);
  const { page, close } = await openPlayer(spec, scenes, duration);
  const files: string[] = [];
  try {
    for (const s of scenes) {
      const t = s.start + Math.min(s.dur - 0.35, Math.max(1.6, s.dur * 0.6));
      await page.evaluate((tt) => (window as unknown as { seekPaint: (t: number) => unknown }).seekPaint(tt), t);
      const f = path.join(outDir, `scene-${String(s.i + 1).padStart(2, "0")}.jpg`);
      await page.screenshot({ path: f, type: "jpeg", quality: 80 });
      files.push(f);
    }
  } finally {
    await close();
  }
  return files;
}

/** One still at time t of a single scene, e.g. a thumbnail. */
export async function renderStill(spec: RenderSpec, out: string, t = 1.8) {
  const { scenes, duration } = timeline(spec.scenes);
  const { page, close } = await openPlayer({ ...spec, captions: false }, scenes, duration);
  try {
    await page.evaluate((tt) => (window as unknown as { seekPaint: (t: number) => unknown }).seekPaint(tt), t);
    await page.screenshot({ path: out, type: "jpeg", quality: 90 });
  } finally {
    await close();
  }
}

function srtTime(t: number) {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

function srt(scenes: TimedScene[]) {
  let n = 0;
  const lines: string[] = [];
  for (const s of scenes) {
    const words = s.say.split(/\s+/).filter(Boolean);
    const groups: string[] = [];
    for (let k = 0; k < words.length; k += 8) groups.push(words.slice(k, k + 8).join(" "));
    const total = groups.reduce((a, g) => a + g.length, 0);
    let t0 = s.speechStart;
    for (const g of groups) {
      const d = (s.speech * g.length) / total;
      lines.push(`${++n}\n${srtTime(t0)} --> ${srtTime(t0 + d)}\n${g}\n`);
      t0 += d;
    }
  }
  return lines.join("\n");
}

/** Full render: narration, frames, music bed with ducking, mastered to -14 LUFS, muxed to MP4. */
export async function renderVideo(spec: RenderSpec, outBase: string, onProgress: Progress = () => {}) {
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const work = `${outBase}.work`;
  fs.mkdirSync(work, { recursive: true });

  // 1. Narration sets the timing.
  const voice: { file: string; duration: number }[] = [];
  for (let i = 0; i < spec.scenes.length; i++) {
    onProgress("narration", i / spec.scenes.length);
    const say = spec.scenes[i].say;
    voice.push(say ? await speak(say, spec.voiceId) : { file: "", duration: 0 });
  }
  const { scenes, duration } = timeline(spec.scenes, voice.map((v) => (v.file ? v.duration : undefined)));

  // 2. Frames: several pages render interleaved ranges in parallel, each piped into its own x264, then concatenated.
  const video = path.join(work, "video.mp4");
  const fps = cfg.fps;
  const frames = Math.ceil(duration * fps);
  const workers = Math.max(1, Math.min(cfg.workers, Math.ceil(frames / 60)));
  const per = Math.ceil(frames / workers);
  let doneFrames = 0;
  const segments = await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      const from = w * per;
      const to = Math.min(frames, from + per);
      const seg = path.join(work, `seg-${w}.mp4`);
      const ff = spawn(FFMPEG, [
        "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps), seg,
      ]);
      let ffErr = "";
      ff.stderr.on("data", (d) => (ffErr += d));
      const ffDone = new Promise<void>((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg: ${ffErr.slice(-800)}`)))));
      const { page, close } = await openPlayer(spec, scenes, duration);
      const cdp = await page.context().newCDPSession(page);
      try {
        for (let f = from; f < to; f++) {
          await page.evaluate((tt) => (window as unknown as { seekPaint: (t: number) => unknown }).seekPaint(tt), f / fps);
          const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, optimizeForSpeed: true });
          if (!ff.stdin.write(Buffer.from(data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
          if (++doneFrames % 20 === 0) onProgress("frames", doneFrames / frames);
        }
      } finally {
        ff.stdin.end();
        await close();
      }
      await ffDone;
      return seg;
    }),
  );
  const list = path.join(work, "segments.txt");
  fs.writeFileSync(list, segments.map((f) => `file '${f}'`).join("\n"));
  await run(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", video]);

  // 3. Soundtrack.
  onProgress("audio", 0);
  const music = path.join(work, "music.wav");
  makeMusic(music, duration, spec.music);
  const audio = path.join(work, "audio.m4a");
  const parts = scenes.map((s, i) => ({ file: voice[i].file, at: s.speechStart })).filter((p) => p.file);
  const args = ["-y", "-loglevel", "error", "-i", music, ...parts.flatMap((p) => ["-i", p.file])];
  let filter: string;
  if (parts.length) {
    const delayed = parts.map((p, k) => `[${k + 1}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(p.at * 1000)}:all=1[n${k}]`);
    filter = [
      ...delayed,
      `${parts.map((_, k) => `[n${k}]`).join("")}amix=inputs=${parts.length}:normalize=0,volume=1.0[narr]`,
      "[narr]asplit=2[nk][nm]",
      "[0:a]volume=0.5[m]",
      "[m][nk]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450[duck]",
      "[duck][nm]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1:LRA=11[out]",
    ].join(";");
  } else filter = "[0:a]loudnorm=I=-14:TP=-1:LRA=11[out]";
  await run(FFMPEG, [...args, "-filter_complex", filter, "-map", "[out]", "-t", duration.toFixed(3), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", audio]);

  // 4. Mux.
  onProgress("mux", 0.9);
  const mp4 = `${outBase}.mp4`;
  await run(FFMPEG, ["-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", mp4]);
  const srtFile = `${outBase}.srt`;
  fs.writeFileSync(srtFile, srt(scenes));
  fs.rmSync(work, { recursive: true, force: true });
  onProgress("done", 1);
  return { video: mp4, srt: srtFile, duration, scenes };
}
