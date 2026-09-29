import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { customAlphabet } from "nanoid";
import { DATA_DIR } from "./config";
import type { Storyboard } from "./storyboard";

export type SourceKind = "website" | "expo";

export type JobInput = {
  kind: SourceKind;
  /** Website URL, or an Expo project as a git URL or a local folder path. */
  target: string;
  /** Optional: what the founder said about the app (typed, or imported from Plaud). */
  founderNotes?: string;
  plaudRecordingId?: string;
  cuts: CutId[];
  voiceId?: string;
  /** Pause for a human approval before narration and rendering. */
  requireApproval: boolean;
};

export type CutId = "short" | "main";

export type Shot = {
  id: string;
  file: string; // relative to job dir
  kind: "desktop" | "mobile" | "fullpage";
  width: number;
  height: number;
  title?: string;
  url?: string;
};

export type Capture = {
  name: string;
  tagline?: string;
  description?: string;
  url?: string;
  iconFile?: string;
  theme: Theme;
  shots: Shot[];
  text: string; // visible copy, trimmed, for the models
};

export type Theme = {
  mode: "dark" | "light";
  bg: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  font: string;
};

export type Understanding = {
  name: string;
  oneLiner: string;
  audience: string;
  category: string;
  features: { title: string; benefit: string; shot: string }[];
  heroShot: string;
  proofPoints: string[];
};

export type CrewMessage = {
  id: string;
  at: number;
  from: string; // agent role or "human" or "system"
  to: string[];
  text: string;
  kind: "message" | "event";
  eventType?: "thought" | "tool_call" | "tool_result" | "error" | "task" | "attention";
  verdict?: "APPROVED" | "BLOCKED";
  images?: string[];
};

export type Usage = { role: string; model: string; input: number; output: number; usd: number; calls: number };

export type JobStatus =
  | "queued"
  | "capturing"
  | "understanding"
  | "writing"
  | "reviewing"
  | "awaiting_approval"
  | "narrating"
  | "rendering"
  | "done"
  | "failed";

export type Output = { cut: CutId; video: string; srt: string; thumb?: string; youtube: string; duration: number };

export type Job = {
  id: string;
  createdAt: number;
  input: JobInput;
  status: JobStatus;
  step?: string;
  progress?: number;
  error?: string;
  roster: string[]; // agents recruited into this job's room
  bandRoomId?: string;
  capture?: Capture;
  understanding?: Understanding;
  storyboard?: Storyboard;
  revisions: number;
  outputs: Output[];
  usage: Usage[];
  messages: CrewMessage[];
};

const nano = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);
const g = globalThis as unknown as { __reel?: { bus: EventEmitter; jobs: Map<string, Job> } };
const state = (g.__reel ??= { bus: new EventEmitter(), jobs: new Map() });
state.bus.setMaxListeners(200);

export const jobDir = (id: string) => path.join(DATA_DIR, "jobs", id);

export function createJob(input: JobInput): Job {
  const job: Job = {
    id: nano(),
    createdAt: Date.now(),
    input,
    status: "queued",
    roster: [],
    revisions: 0,
    outputs: [],
    usage: [],
    messages: [],
  };
  fs.mkdirSync(jobDir(job.id), { recursive: true });
  state.jobs.set(job.id, job);
  save(job);
  return job;
}

export function getJob(id: string): Job | undefined {
  if (!/^[a-z0-9]+$/.test(id)) return undefined;
  const cached = state.jobs.get(id);
  if (cached) return cached;
  const file = path.join(jobDir(id), "job.json");
  if (!fs.existsSync(file)) return undefined;
  const job = JSON.parse(fs.readFileSync(file, "utf8")) as Job;
  state.jobs.set(id, job);
  return job;
}

export function listJobs(): Job[] {
  const dir = path.join(DATA_DIR, "jobs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((id) => getJob(id))
    .filter((j): j is Job => !!j)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function save(job: Job) {
  fs.writeFileSync(path.join(jobDir(job.id), "job.json"), JSON.stringify(job, null, 2));
  state.bus.emit(`job:${job.id}`, job);
}

export function update(job: Job, patch: Partial<Job>) {
  Object.assign(job, patch);
  save(job);
}

export function pushMessage(job: Job, m: Omit<CrewMessage, "id" | "at">) {
  const msg: CrewMessage = { id: nano(), at: Date.now(), ...m };
  job.messages.push(msg);
  save(job);
  return msg;
}

export function addUsage(job: Job, u: Omit<Usage, "calls">) {
  const row = job.usage.find((r) => r.role === u.role && r.model === u.model);
  if (row) {
    row.input += u.input;
    row.output += u.output;
    row.usd += u.usd;
    row.calls += 1;
  } else job.usage.push({ ...u, calls: 1 });
  save(job);
}

export function subscribe(id: string, fn: (job: Job) => void) {
  state.bus.on(`job:${id}`, fn);
  return () => state.bus.off(`job:${id}`, fn);
}
