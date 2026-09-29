import { z } from "zod";
import type { CutId } from "./store";

const clamp = (v: number, a: number, b: number) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : a);

export const SCENE_TYPES = ["hook", "feature", "landing", "grid", "stat", "steps", "quote", "end"] as const;

export const Scene = z.object({
  type: z.enum(SCENE_TYPES),
  /** Short on-screen line. Wrap the key words in <a>...</a> to color them with the accent. */
  headline: z.string().default(""),
  sub: z.string().optional(),
  kicker: z.string().optional(),
  /** Narration for this scene. Its length sets the scene length. */
  say: z.string().default(""),
  shot: z.string().optional(),
  shots: z.array(z.string()).optional(),
  /** Where to zoom on the shot, 0..1 of width and height. */
  focus: z
    .object({ x: z.coerce.number(), y: z.coerce.number(), scale: z.coerce.number().default(1.35) })
    .transform((f) => ({ x: clamp(f.x, 0, 1), y: clamp(f.y, 0, 1), scale: clamp(f.scale, 1, 2.5) }))
    .optional()
    .catch(undefined),
  bullets: z.array(z.string()).optional(),
  steps: z.array(z.string()).optional(),
  value: z.string().optional(),
  who: z.string().optional(),
  cta: z.string().optional(),
});
export type Scene = z.infer<typeof Scene>;

const Meta = z.object({ title: z.string(), description: z.string(), tags: z.array(z.string()).default([]) });

export const Storyboard = z.object({
  cuts: z.object({ short: z.array(Scene).optional(), main: z.array(Scene).optional() }),
  youtube: z.object({ short: Meta.optional(), main: Meta.optional() }).default({}),
  thumb: z.object({ title: z.string(), sub: z.string().optional(), shot: z.string().optional() }).optional(),
});
export type Storyboard = z.infer<typeof Storyboard>;

export const CUTS: Record<CutId, { w: number; h: number; label: string; target: [number, number] }> = {
  short: { w: 1080, h: 1920, label: "YouTube Short (vertical)", target: [22, 35] },
  main: { w: 1920, h: 1080, label: "1-minute promo", target: [45, 65] },
};

const MIN: Record<Scene["type"], number> = { hook: 2.6, feature: 4.2, landing: 5, grid: 3.6, stat: 2.8, steps: 4.5, quote: 4, end: 3.6 };
export const XFADE = 0.45;
const CHARS_PER_SEC = 14.5;

export type TimedScene = Scene & { i: number; start: number; dur: number; speechStart: number; speech: number; audio?: string };

/** Lay scenes on a timeline. Speech durations come from real narration when available, else an estimate. */
export function timeline(scenes: Scene[], speech: (number | undefined)[] = []): { scenes: TimedScene[]; duration: number } {
  let t = 0;
  const out: TimedScene[] = scenes.map((s, i) => {
    const sp = speech[i] ?? (s.say ? s.say.length / CHARS_PER_SEC : 0);
    const lead = i === 0 ? 0.35 : 0.5;
    const dur = Math.max(MIN[s.type], lead + sp + (s.type === "end" ? 1.4 : 0.45));
    const scene = { ...s, i, start: t, dur, speechStart: t + lead, speech: sp };
    t += dur - (i < scenes.length - 1 ? XFADE : 0);
    return scene;
  });
  return { scenes: out, duration: t };
}

export function parseStoryboard(v: unknown): Storyboard {
  return Storyboard.parse(v);
}

/** Checks the model output against the captured shots, returning human-readable problems. */
export function lint(sb: Storyboard, shotIds: string[], cuts: CutId[]): string[] {
  const problems: string[] = [];
  const ids = new Set(shotIds);
  for (const cut of cuts) {
    const scenes = sb.cuts[cut];
    if (!scenes?.length) {
      problems.push(`The "${cut}" cut is missing.`);
      continue;
    }
    const { duration } = timeline(scenes);
    const [lo, hi] = CUTS[cut].target;
    if (duration < lo - 3 || duration > hi + 5) problems.push(`The "${cut}" cut runs ${duration.toFixed(0)}s; aim for ${lo} to ${hi}s by changing the narration length.`);
    if (scenes[0].type !== "hook") problems.push(`The "${cut}" cut must start with a hook scene.`);
    if (scenes[scenes.length - 1].type !== "end") problems.push(`The "${cut}" cut must end with an end scene.`);
    scenes.forEach((s, i) => {
      for (const id of [s.shot, ...(s.shots ?? [])].filter(Boolean) as string[])
        if (!ids.has(id)) problems.push(`${cut} scene ${i + 1} uses shot "${id}", which does not exist.`);
      if (["feature", "landing"].includes(s.type) && !s.shot) problems.push(`${cut} scene ${i + 1} (${s.type}) needs a shot.`);
      if (s.headline.replace(/<[^>]+>/g, "").length > 60) problems.push(`${cut} scene ${i + 1} headline is too long for the screen.`);
    });
  }
  return problems;
}
