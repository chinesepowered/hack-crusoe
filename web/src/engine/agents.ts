import fs from "node:fs";
import path from "node:path";
import { captureExpo } from "./capture/expo";
import { captureWebsite } from "./capture/web";
import { Crew, ROLES, type Envelope, type Role } from "./crew";
import { askJSON } from "./llm";
import { imageDataURL } from "./media";
import { renderStill, renderStills, renderVideo, type RenderSpec } from "./render";
import { CUTS, lint, parseStoryboard, SCENE_TYPES, timeline, type Scene, type Storyboard } from "./storyboard";
import { createJob, jobDir, update, type Capture, type CutId, type Job, type JobInput, type Understanding } from "./store";

const MAX_REVISIONS = 2;
const crews = new Map<string, Crew>();

/* ------------------------------------------------------------------ prompts */

const STYLE = `Writing rules: plain, confident, specific. No hype words (revolutionary, game-changing, seamless, unleash, supercharge, elevate). Never use em dashes. Never invent numbers, customers, awards or features that are not in the captured material.`;

const UNDERSTAND = `You are a product marketer looking at screenshots of a product for the first time.
Work out what it is, who it is for, and its strongest features, using only what is visible in the screenshots and the page text.
${STYLE}
Reply with JSON only:
{"name": string, "oneLiner": string (max 12 words), "audience": string, "category": string,
 "features": [{"title": string (max 5 words), "benefit": string (one sentence), "shot": string (id of the screenshot that shows it best)}] (3 to 5),
 "heroShot": string (screenshot id for the opening), "proofPoints": [string] (facts visible on the page, may be empty)}`;

const WRITE = `You write launch videos for YouTube. You get a product brief and a list of screenshot ids, and you return a storyboard as JSON.
Scene types: ${SCENE_TYPES.join(", ")}.
- hook: first scene. Names the product or the problem in under 2 seconds of narration. Optional shot.
- feature: one feature. kicker (like "01 Search"), headline, sub (one line), optional bullets (max 3, 2 to 4 words each), shot (required), optional focus {x,y,scale} in 0..1 to zoom into the part of the screenshot that shows the feature.
- landing: a website's full landing page scrolling in a browser. shot must be a "fullpage" screenshot.
- grid: 2 or 3 screenshots side by side (shots: [ids]).
- stat: one big fact (value like "3 taps") with headline. Only use facts from the brief.
- steps: 3 short steps (steps: [strings]).
- quote: a short line the product would say about itself, headline is the quote.
- end: last scene. headline is the product name, sub is the one-liner, cta is the domain or where to get it.
Headlines: max 6 words, wrap 1 to 3 key words in <a>...</a> for the accent color.
"say" is the voiceover for the scene: natural spoken English, one or two short sentences. Its length sets the scene length (about 14 characters per second).
Cuts:
- "short": vertical YouTube Short, 22 to 35 seconds, 5 to 7 scenes. Hook hard, one idea per scene.
- "main": horizontal 1-minute promo, 45 to 65 seconds, 7 to 10 scenes. Show 3 or 4 features and end with a clear call to action.
Also write YouTube metadata per cut: title (max 70 chars, product name first), description (3 short paragraphs plus the link), tags (8 to 12).
And a thumbnail: {"title": 2 to 5 huge words with one <a>accent</a>, "sub": short chip text, "shot": id}.
${STYLE}
Reply with JSON only: {"cuts": {"short": [scenes], "main": [scenes]}, "youtube": {"short": {...}, "main": {...}}, "thumb": {...}}`;

const CRITIQUE = `You are the frame critic for a launch video. You see one still per scene, in order, with the storyboard.
Block the video if any scene has: text that is cut off, overlapping or too small to read; a screenshot that does not match what the headline or narration claims; a claim (number, feature, customer) that is not supported by the product brief; a hook that does not make clear what the product is by scene 2; an end scene without a clear call to action.
Do not block for taste. Be specific and actionable.
Reply with JSON only: {"verdict": "APPROVED" | "BLOCKED", "summary": string, "issues": [{"cut": "short"|"main", "scene": number (1-based), "problem": string, "fix": string}]}`;

/* ------------------------------------------------------------------ helpers */

/** Band delivers mentions as @[[uuid]]; drop those and plain @Names to get what the person actually said. */
const stripMentions = (t: string) =>
  t.replace(/@\[\[[^\]]*\]\]/g, "").replace(new RegExp(`@(${Object.values(ROLES).map((r) => r.name).join("|")}|you)\\b`, "g"), "").replace(/\s+/g, " ").trim();

const nice = (s: string) => s.replace(/\s+\u2014\s+|\u2014/g, ", ");

function shotList(c: Capture) {
  return c.shots.map((s) => `- ${s.id} (${s.kind}${s.title ? `, "${s.title}"` : ""})`).join("\n");
}

function renderSpec(job: Job, scenes: Scene[], cut: CutId): RenderSpec {
  const c = job.capture!;
  const { w, h } = CUTS[cut];
  return {
    assetsDir: jobDir(job.id),
    scenes,
    w,
    h,
    theme: c.theme,
    name: job.understanding?.name ?? c.name,
    url: c.url,
    icon: c.iconFile,
    shots: c.shots,
    voiceId: job.input.voiceId,
    music: { bpm: cut === "short" ? 116 : 104, seed: job.id.charCodeAt(0), mood: c.theme.mode === "dark" ? "calm" : "bright" },
  };
}

const rel = (job: Job, f: string) => path.relative(jobDir(job.id), f);

/* ------------------------------------------------------------------ agents */

async function director(crew: Crew, e: Envelope) {
  const job = crew.job;
  const d = e.data as { kind?: string } | undefined;

  if (e.from === "human" && job.status === "queued") {
    const scout: Role = job.input.kind === "expo" ? "app_scout" : "web_scout";
    await crew.event("director", "thought", `Source is ${job.input.kind === "expo" ? "an Expo React Native project" : "a live website"}, so this job needs the ${ROLES[scout].name}.`);
    await crew.recruit("director", scout, job.input.kind === "expo" ? "build the app for web and tap through its screens" : "capture the site and read it");
    update(job, { status: "capturing", step: "Capturing" });
    await crew.send("director", [scout], `Please capture ${job.input.target} and tell me what the product is.`, { kind: "capture" });
    return;
  }

  if (d?.kind === "brief") {
    update(job, { status: "writing", step: "Writing the storyboard" });
    const u = job.understanding!;
    await crew.send("director", ["writer"], `Brief is ready: ${u.name}, "${u.oneLiner}". Please write the ${job.input.cuts.join(" and ")} cut${job.input.cuts.length > 1 ? "s" : ""}.`, { kind: "write" });
    return;
  }

  if (d?.kind === "reviewed") {
    const r = d as unknown as { kind: string; verdict: string; stills: string[] };
    if (job.input.requireApproval) {
      update(job, { status: "awaiting_approval", step: "Waiting for your approval" });
      const note = r.verdict === "APPROVED" ? "The Frame Critic approved every frame." : `The Frame Critic still has concerns after ${MAX_REVISIONS} revisions; please look closely.`;
      await crew.send("director", ["human"], `${note} Reply "approve" to render, or tell me what to change.`, undefined, { images: r.stills });
    } else await startRender(crew);
    return;
  }

  if (e.from === "human" && job.status === "awaiting_approval") {
    const said = stripMentions(e.text);
    if (/^(approve|approved|ship it|ship|yes|lgtm|go|render)\b/i.test(said)) await startRender(crew);
    else {
      update(job, { status: "writing", step: "Revising from your notes" });
      await crew.send("director", ["writer"], `The human asked for changes: "${said}". Please revise.`, { kind: "revise", notes: [said], from: "human" });
    }
    return;
  }

  if (d?.kind === "rendered") {
    update(job, { status: "done", step: "Done", progress: 1 });
    await crew.send("director", ["human"], `Your videos are ready: ${job.outputs.map((o) => `${CUTS[o.cut].label} (${o.duration.toFixed(0)}s)`).join(", ")}. YouTube titles, descriptions, tags, captions and a thumbnail are included.`);
    crew.stop();
  }
}

async function startRender(crew: Crew) {
  update(crew.job, { status: "narrating", step: "Narrating and rendering" });
  await crew.send("director", ["producer"], "Approved. Please narrate, render and master the final cuts.", { kind: "render" });
}

async function scout(role: "web_scout" | "app_scout", crew: Crew) {
  const job = crew.job;
  const dir = jobDir(job.id);
  const log = (t: string) => void crew.event(role, "tool_result", t);
  await crew.event(role, "tool_call", role === "web_scout" ? `capture_website("${job.input.target}")` : `expo_export_web("${job.input.target}") then tap through screens`);
  const capture = role === "web_scout" ? await captureWebsite(job.input.target, dir, log) : await captureExpo(job.input.target, dir, log);
  update(job, { capture, status: "understanding", step: "Reading the screenshots" });

  const pick = capture.shots.filter((s) => s.kind !== "fullpage").slice(0, 7);
  await crew.event(role, "tool_call", `vision.read(${pick.length} screenshots)`, { images: pick.map((s) => s.file) });
  const images = await Promise.all(pick.map((s) => imageDataURL(path.join(dir, s.file))));
  const u = await askJSON<Understanding>({
    job,
    role: "vision",
    system: UNDERSTAND,
    user: `Screenshots, in order: ${pick.map((s) => s.id).join(", ")}.\nAll screenshot ids you may reference:\n${shotList(capture)}\n\nPage text:\n${capture.text}${job.input.founderNotes ? `\n\nThe maker asked us to emphasize: ${job.input.founderNotes}` : ""}`,
    images,
  });
  const ids = new Set(capture.shots.map((s) => s.id));
  u.features = (u.features ?? []).filter((f) => ids.has(f.shot));
  if (!ids.has(u.heroShot)) u.heroShot = pick[0].id;
  update(job, { understanding: u });
  await crew.send(
    role,
    ["director"],
    `Captured ${capture.shots.length} screens. It is ${u.name}: ${nice(u.oneLiner)} For ${u.audience}. Strongest features: ${u.features.map((f) => f.title).join(", ")}.`,
    { kind: "brief" },
  );
}

async function writer(crew: Crew, e: Envelope) {
  const job = crew.job;
  const d = e.data as { kind: string; notes?: string[]; from?: string };
  const u = job.understanding!;
  const c = job.capture!;
  const brief = `PRODUCT BRIEF\nName: ${u.name}\nOne-liner: ${u.oneLiner}\nAudience: ${u.audience}\nCategory: ${u.category}\nFeatures:\n${u.features.map((f) => `- ${f.title}: ${f.benefit} (shot ${f.shot})`).join("\n")}\nProof points: ${u.proofPoints.join("; ") || "none"}\nHero shot: ${u.heroShot}\nLink: ${c.url ?? "(app stores)"}\n\nSCREENSHOTS\n${shotList(c)}\n\nPAGE TEXT (for facts only)\n${c.text.slice(0, 4000)}${job.input.founderNotes ? `\n\nTHE MAKER WANTS TO EMPHASIZE\n${job.input.founderNotes}` : ""}`;

  let user = `${brief}\n\nWrite these cuts: ${job.input.cuts.join(", ")}.`;
  if (d.kind === "revise" && job.storyboard) {
    update(job, { revisions: job.revisions + 1 });
    user += `\n\nCURRENT STORYBOARD\n${JSON.stringify(job.storyboard)}\n\nREVISE IT to fix these problems (keep everything else):\n${(d.notes ?? []).map((n) => `- ${n}`).join("\n")}`;
    await crew.event("writer", "thought", `Revision ${job.revisions}: fixing ${d.notes?.length ?? 0} issue(s) raised by ${d.from === "human" ? "you" : "the Frame Critic"}.`);
  }

  let sb: Storyboard | undefined;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await askJSON<unknown>({ job, role: "writer", system: WRITE, user: attempt === 0 ? user : `${user}\n\nYour last storyboard had these problems, fix them:\n${problems.map((p) => `- ${p}`).join("\n")}` });
    try {
      sb = parseStoryboard(JSON.parse(nice(JSON.stringify(raw))));
      problems = lint(sb, c.shots.map((s) => s.id), job.input.cuts);
    } catch (err) {
      problems = [`Invalid storyboard: ${(err as Error).message.slice(0, 400)}`];
    }
    if (!problems.length) break;
    await crew.event("writer", "tool_result", `lint: ${problems.length} problem(s), rewriting. ${problems.slice(0, 3).join(" ")}`);
  }
  if (!sb) throw new Error(`The writer could not produce a valid storyboard: ${problems.join(" ")}`);
  update(job, { storyboard: sb, status: "reviewing", step: "Rendering stills for review" });

  // Render a contact sheet so the critic reviews real frames, not JSON.
  const stills: string[] = [];
  for (const cut of job.input.cuts) {
    const files = await renderStills(renderSpec(job, sb.cuts[cut]!, cut), path.join(jobDir(job.id), "stills", `r${job.revisions}`, cut));
    stills.push(...files.map((f) => rel(job, f)));
  }
  const lens = job.input.cuts.map((cut) => `${cut} ${timeline(sb!.cuts[cut]!).duration.toFixed(0)}s`).join(", ");
  await crew.event("writer", "tool_result", `Rendered ${stills.length} stills (${lens}).`, { images: stills });
  await crew.send("writer", ["critic"], `Storyboard ${d.kind === "revise" ? `revision ${job.revisions}` : "draft"} is ready (${lens}). Please review the frames.`, { kind: "review", stills });
}

async function critic(crew: Crew, e: Envelope) {
  const job = crew.job;
  const d = e.data as { stills: string[] };
  const sb = job.storyboard!;
  const images = await Promise.all(d.stills.map((f) => imageDataURL(path.join(jobDir(job.id), f), 640, 900)));
  const order = d.stills.map((f) => f.replace(/^.*stills\/r\d+\//, "").replace(/scene-0?/, "scene ").replace(".jpg", "")).join(", ");
  const u = job.understanding!;
  const r = await askJSON<{ verdict: "APPROVED" | "BLOCKED"; summary: string; issues: { cut: string; scene: number; problem: string; fix: string }[] }>({
    job,
    role: "vision",
    system: CRITIQUE,
    user: `Images in order: ${order}.\n\nPRODUCT BRIEF: ${u.name}. ${u.oneLiner}. Features: ${u.features.map((f) => f.title).join(", ")}. Proof points: ${u.proofPoints.join("; ") || "none"}.\n\nSTORYBOARD\n${JSON.stringify(sb.cuts)}`,
    images,
  });
  const issues = (r.issues ?? []).slice(0, 8);
  const blocked = r.verdict === "BLOCKED" && issues.length > 0;
  if (blocked && job.revisions < MAX_REVISIONS) {
    await crew.send(
      "critic",
      ["writer"],
      `BLOCKED. ${nice(r.summary)} ${issues.map((i) => `(${i.cut} ${i.scene}) ${nice(i.problem)} Fix: ${nice(i.fix)}`).join(" ")}`,
      { kind: "revise", notes: issues.map((i) => `${i.cut} scene ${i.scene}: ${i.problem} Fix: ${i.fix}`), from: "critic" },
      { verdict: "BLOCKED" },
    );
    update(job, { status: "writing", step: "Revising after critique" });
  } else {
    await crew.send(
      "critic",
      ["director"],
      `${blocked ? "Still BLOCKED after the revision limit" : "APPROVED"}. ${nice(r.summary)}`,
      { kind: "reviewed", verdict: blocked ? "BLOCKED" : "APPROVED", stills: d.stills },
      { verdict: blocked ? "BLOCKED" : "APPROVED" },
    );
  }
}

async function producer(crew: Crew) {
  const job = crew.job;
  const sb = job.storyboard!;
  const outDir = path.join(jobDir(job.id), "out");
  const outputs = [];
  const cuts = job.input.cuts;
  for (let k = 0; k < cuts.length; k++) {
    const cut = cuts[k];
    await crew.event("producer", "tool_call", `render("${cut}", ${CUTS[cut].w}x${CUTS[cut].h})`);
    const res = await renderVideo(renderSpec(job, sb.cuts[cut]!, cut), path.join(outDir, cut), (stage, p) => {
      const step = stage === "narration" ? "Narrating" : stage === "frames" ? "Rendering frames" : stage === "audio" ? "Mixing audio" : "Finishing";
      update(job, { status: stage === "narration" ? "narrating" : "rendering", step: `${CUTS[cut].label}: ${step}`, progress: (k + (stage === "frames" ? 0.1 + 0.8 * p : stage === "narration" ? 0.1 * p : 0.95)) / cuts.length });
    });
    const meta = sb.youtube[cut];
    const yt = path.join(outDir, `${cut}.youtube.txt`);
    fs.writeFileSync(
      yt,
      meta ? `TITLE\n${meta.title}\n\nDESCRIPTION\n${meta.description}\n\nTAGS\n${meta.tags.join(", ")}\n` : `TITLE\n${job.understanding?.name}\n`,
    );
    outputs.push({ cut, video: rel(job, res.video), srt: rel(job, res.srt), youtube: rel(job, yt), duration: res.duration });
    await crew.event("producer", "tool_result", `${CUTS[cut].label}: ${res.duration.toFixed(1)}s, mastered to -14 LUFS.`);
  }
  // Thumbnail: a hook-style frame built from the writer's thumbnail brief.
  const t = sb.thumb ?? { title: job.understanding?.name ?? "", shot: job.understanding?.heroShot };
  const thumb = path.join(outDir, "thumbnail.jpg");
  await renderStill({ ...renderSpec(job, [{ type: "hook", headline: t.title, sub: t.sub, say: "", shot: t.shot }], "main"), w: 1280, h: 720 }, thumb, 2.4);
  update(job, { outputs: outputs.map((o) => ({ ...o, thumb: rel(job, thumb) })) });
  await crew.send("producer", ["director"], `Rendered ${outputs.length} cut(s) and a thumbnail.`, { kind: "rendered" });
}

/* ------------------------------------------------------------------ runtime */

async function loop(crew: Crew, role: Role) {
  for await (const e of crew.inbox(role)) {
    try {
      const d = e.data as { kind?: string } | undefined;
      if (role === "director") await director(crew, e);
      else if ((role === "web_scout" || role === "app_scout") && d?.kind === "capture") await scout(role, crew);
      else if (role === "writer" && (d?.kind === "write" || d?.kind === "revise")) await writer(crew, e);
      else if (role === "critic" && d?.kind === "review") await critic(crew, e);
      else if (role === "producer" && d?.kind === "render") await producer(crew);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.error(`[${role}]`, err);
      await crew.event(role, "error", msg.slice(0, 1500));
      update(crew.job, { status: "failed", error: `${ROLES[role].name}: ${msg.slice(0, 600)}` });
      crew.stop();
    } finally {
      await e.ack();
    }
  }
}

export async function startJob(input: JobInput): Promise<Job> {
  const job = createJob(input);
  const crew = new Crew(job);
  crews.set(job.id, crew);
  void (async () => {
    try {
      await crew.open();
      const roles: Role[] = ["director", "writer", "critic", "producer", input.kind === "expo" ? "app_scout" : "web_scout"];
      roles.forEach((r) => void loop(crew, r));
      await crew.human(
        `Make ${input.cuts.map((c) => (c === "short" ? "a YouTube Short" : "a 1-minute promo")).join(" and ")} for ${input.target}.${input.founderNotes ? ` Emphasize: ${input.founderNotes}` : ""}`,
      );
    } catch (err) {
      update(job, { status: "failed", error: (err as Error).message });
      crew.stop();
    }
  })();
  return job;
}

export async function humanSays(id: string, text: string) {
  const crew = crews.get(id);
  if (!crew) throw new Error("This job is not running in this server process.");
  await crew.human(text);
}
