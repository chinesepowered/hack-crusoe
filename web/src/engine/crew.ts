import fs from "node:fs";
import path from "node:path";
import { band } from "./config";
import { agentApi, humanApi } from "./band";
import { jobDir, pushMessage, update, type CrewMessage, type Job } from "./store";

export const ROLES = {
  director: { name: "Reel Director", blurb: "Runs the room: recruits specialists, routes work, asks the human to approve." },
  web_scout: { name: "Web Scout", blurb: "Captures a live website and works out what the product does." },
  app_scout: { name: "App Scout", blurb: "Builds an Expo app for web, taps through its screens and reads them." },
  writer: { name: "Storyboard Writer", blurb: "Writes the scenes, narration and YouTube copy." },
  critic: { name: "Frame Critic", blurb: "Looks at rendered frames and blocks anything unreadable or unsupported." },
  producer: { name: "Producer", blurb: "Narrates, renders and masters the final videos." },
} as const;
export type Role = keyof typeof ROLES;
export type Party = Role | "human";

export type Envelope = { from: Party; text: string; data?: unknown; ack: () => Promise<void> };

/**
 * The room the crew coordinates in. With Band configured, every handoff is a Band message that
 * @mentions the next agent, and each agent only acts on messages delivered to it by Band.
 * Without Band, the same protocol runs over in-process queues.
 */
export class Crew {
  private queues = new Map<Party, Envelope[]>();
  private waiters = new Map<Party, () => void>();
  private stopped = false;
  private refs = 0;
  readonly mode: "band" | "local";

  constructor(readonly job: Job) {
    const need: Role[] = ["director", "writer", "critic", "producer", job.input.kind === "expo" ? "app_scout" : "web_scout"];
    this.mode = band.enabled && band.userKey && need.every((r) => band.agents[r]) ? "band" : "local";
    fs.mkdirSync(path.join(jobDir(job.id), "refs"), { recursive: true });
  }

  private api(role: Role) {
    return agentApi(band.agents[role].key);
  }
  private roleOf(bandId: string): Party {
    return (Object.keys(band.agents) as Role[]).find((r) => band.agents[r].id === bandId) ?? "human";
  }

  /** Open the room with the core crew. Specialists are recruited later, per job. */
  async open() {
    const job = this.job;
    const core: Role[] = ["director", "writer", "critic", "producer"];
    if (this.mode === "band") {
      const title = `Launch video: ${job.input.target.replace(/^https?:\/\//, "").slice(0, 80)}`;
      const room = await this.api("director").createChat(title);
      const id = room!.data.id;
      update(job, { bandRoomId: id });
      const human = band.humanId || (await humanApi(band.userKey).me())?.data.user.id;
      if (human) await this.api("director").addParticipant(id, human).catch(() => {});
      for (const r of core.slice(1)) await this.api("director").addParticipant(id, band.agents[r].id);
    }
    update(job, { roster: core });
    this.system(`Room opened${this.mode === "band" ? " on Band" : ""}. Crew: ${core.map((r) => ROLES[r].name).join(", ")}.`);
  }

  /** Runtime recruitment: bring a specialist into this job's room. */
  async recruit(by: Role, role: Role, reason: string) {
    if (this.job.roster.includes(role)) return;
    if (this.mode === "band") await this.api(by).addParticipant(this.job.bandRoomId!, band.agents[role].id);
    update(this.job, { roster: [...this.job.roster, role] });
    await this.event(by, "task", `Recruited ${ROLES[role].name}: ${reason}`);
  }

  private saveRef(data: unknown) {
    const n = ++this.refs;
    fs.writeFileSync(path.join(jobDir(this.job.id), "refs", `${n}.json`), JSON.stringify(data));
    return n;
  }
  private loadRef(text: string) {
    const m = text.match(/\[ref:(\d+)\]/);
    if (!m) return undefined;
    const f = path.join(jobDir(this.job.id), "refs", `${m[1]}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : undefined;
  }

  /** Send a message that @mentions the recipients. Only they will receive it. */
  async send(from: Role, to: Party[], text: string, data?: unknown, extra: Partial<CrewMessage> = {}) {
    const names = to.map((p) => (p === "human" ? "@you" : `@${ROLES[p].name}`)).join(" ");
    pushMessage(this.job, { from, to, text, kind: "message", ...extra });
    const ref = data === undefined ? "" : ` [ref:${this.saveRef(data)}]`;
    if (this.mode === "band") {
      const ids = to.map((p) => (p === "human" ? band.humanId : band.agents[p].id)).filter(Boolean);
      const humanName = to.includes("human") ? `@${band.humanHandle || "you"} ` : "";
      const content = `${humanName}${to.filter((p) => p !== "human").map((p) => `@${ROLES[p as Role].name}`).join(" ")} ${text}${ref}`.trim();
      await this.api(from).send(this.job.bandRoomId!, content, ids);
    } else {
      for (const p of to) this.deliver(p, { from, text: `${names} ${text}`, data, ack: async () => {} });
    }
  }

  /** Informational record in the room (tool calls, thoughts, errors). Not routed to anyone. */
  async event(from: Role, type: "thought" | "tool_call" | "tool_result" | "error" | "task", text: string, extra: Partial<CrewMessage> = {}) {
    pushMessage(this.job, { from, to: [], text, kind: "event", eventType: type, ...extra });
    if (this.mode === "band") await this.api(from).event(this.job.bandRoomId!, type, text).catch(() => {});
  }

  system(text: string) {
    pushMessage(this.job, { from: "system", to: [], text, kind: "event", eventType: "task" });
  }

  /** The human speaks to the Director (from the web UI, or directly in the Band room). */
  async human(text: string) {
    if (this.mode === "band") {
      await humanApi(band.userKey).send(this.job.bandRoomId!, `@${ROLES.director.name} ${text}`, [band.agents.director.id]);
      pushMessage(this.job, { from: "human", to: ["director"], text, kind: "message" });
    } else {
      pushMessage(this.job, { from: "human", to: ["director"], text, kind: "message" });
      this.deliver("director", { from: "human", text, ack: async () => {} });
    }
  }

  private deliver(p: Party, e: Envelope) {
    const q = this.queues.get(p) ?? [];
    q.push(e);
    this.queues.set(p, q);
    this.waiters.get(p)?.();
  }

  /** Messages delivered to one agent, in order. With Band, polled from the agent's own inbox. */
  async *inbox(role: Role): AsyncGenerator<Envelope> {
    while (!this.stopped) {
      if (this.mode === "band") {
        const api = this.api(role);
        const room = this.job.bandRoomId!;
        const m = await api.next(room).catch(() => null);
        if (!m) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        await api.processing(room, m.id).catch(() => {});
        const from = this.roleOf(m.sender_id);
        if (from === role) {
          await api.processed(room, m.id).catch(() => {});
          continue;
        }
        const text = m.content.replace(/\s*\[ref:\d+\]/, "");
        // Humans can type straight into the Band room; mirror that into the app's timeline.
        if (from === "human" && !this.job.messages.some((x) => x.from === "human" && x.text && text.includes(x.text)))
          pushMessage(this.job, { from: "human", to: [role], text, kind: "message" });
        yield { from, text, data: this.loadRef(m.content), ack: async () => void (await api.processed(room, m.id).catch(() => {})) };
      } else {
        const q = this.queues.get(role) ?? [];
        if (q.length) {
          yield q.shift()!;
          continue;
        }
        await new Promise<void>((r) => {
          this.waiters.set(role, r);
          setTimeout(r, 1000);
        });
      }
    }
  }

  stop() {
    this.stopped = true;
    for (const w of this.waiters.values()) w();
  }
}
