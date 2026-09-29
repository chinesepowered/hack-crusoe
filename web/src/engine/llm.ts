import "./net";
import OpenAI from "openai";
import { llm } from "./config";
import { addUsage, pushMessage, type Job } from "./store";

export type Role = keyof typeof llm.models;

let client: OpenAI | null = null;
function api() {
  if (!llm.apiKey) throw new Error("LLM_API_KEY is not set. Add it to web/.env.local.");
  client ??= new OpenAI({ baseURL: llm.baseURL, apiKey: llm.apiKey, maxRetries: 0 });
  return client;
}

type Part = OpenAI.Chat.Completions.ChatCompletionContentPart;
type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type Effort = OpenAI.Chat.Completions.ChatCompletionCreateParams["reasoning_effort"];

export type Ask = {
  job: Job;
  role: Role;
  system: string;
  user: string;
  /** Images as data URLs (JPEG/PNG). Only for the vision role. */
  images?: string[];
  maxTokens?: number;
};

/** Output budget per role. The writer's storyboard for two cuts is long, and Crusoe accepts 32k. */
const BUDGET: Record<Role, number> = { fast: 12000, writer: 32000, vision: 12000 };

/** The model returned no text, usually because it spent its whole output budget reasoning. */
class EmptyReply extends Error {}

/** Price a call by the model that served it, since a fallback can use another role's model. */
function priceOf(model: string, role: Role): [number, number] {
  const owner = (Object.keys(llm.models) as Role[]).find((r) => llm.models[r] === model) ?? role;
  return llm.prices[owner];
}

/** One chat completion with retries on 429/503 and usage accounting for the cost counter. */
async function complete(job: Job, role: Role, model: string, messages: Message[], maxTokens: number, effort?: string): Promise<string> {
  let delay = 1500;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await api().chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature: 0.6,
        messages,
        ...(effort ? { reasoning_effort: effort as Effort } : {}),
      });
      const u = res.usage;
      if (u) {
        const [pin, pout] = priceOf(model, role);
        addUsage(job, {
          role,
          model,
          input: u.prompt_tokens,
          output: u.completion_tokens,
          usd: (u.prompt_tokens * pin + u.completion_tokens * pout) / 1e6,
        });
      }
      const text = res.choices[0]?.message?.content;
      if (!text) throw new EmptyReply(`${model} returned no content (finish: ${res.choices[0]?.finish_reason}).`);
      return text;
    } catch (e) {
      if (e instanceof EmptyReply) throw e;
      const status = (e as { status?: number }).status;
      if (attempt < 4 && (status === 429 || status === 503 || status === 502 || status === undefined)) {
        await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
        delay *= 2;
        continue;
      }
      throw e;
    }
  }
}

/**
 * Ask a role's model. If a reasoning model comes back empty, retry once at low reasoning effort; if it is still
 * empty and the call is text only, hand the step to the fast model so a run never dies on a thinking budget.
 */
export async function ask({ job, role, system, user, images = [], maxTokens }: Ask): Promise<string> {
  const content: string | Part[] = images.length
    ? [{ type: "text", text: user }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
    : user;
  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content },
  ];
  const model = llm.models[role];
  const effort = llm.reasoning[role];
  const budget = maxTokens ?? BUDGET[role];
  const note = (text: string) => pushMessage(job, { from: "system", to: [], text, kind: "event", eventType: "thought" });
  try {
    return await complete(job, role, model, messages, budget, effort);
  } catch (e) {
    if (!(e instanceof EmptyReply)) throw e;
    if (effort !== "low") {
      note(`${model} used its whole output budget reasoning. Retrying with low reasoning effort.`);
      try {
        return await complete(job, role, model, messages, Math.max(budget, BUDGET.writer), "low");
      } catch (e2) {
        if (!(e2 instanceof EmptyReply)) throw e2;
      }
    }
    if (images.length || model === llm.models.fast) throw e;
    note(`${model} returned nothing. Handing this step to ${llm.models.fast}.`);
    return await complete(job, role, llm.models.fast, messages, BUDGET.fast, llm.reasoning.fast || undefined);
  }
}

/** Ask for JSON and parse it, tolerating code fences and prose around the object. Retries once on bad JSON. */
export async function askJSON<T>(a: Ask, validate?: (v: unknown) => T): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    const extra = i === 0 ? "" : `\n\nYour previous reply was not valid JSON (${String(last)}). Reply with the JSON object only.`;
    const raw = await ask({ ...a, user: a.user + extra });
    try {
      const obj = JSON.parse(extractJSON(raw));
      return validate ? validate(obj) : (obj as T);
    } catch (e) {
      last = (e as Error).message.slice(0, 300);
    }
  }
  throw new Error(`Model did not return valid JSON: ${last}`);
}

export function extractJSON(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1];
  const start = s.search(/[[{]/);
  if (start < 0) throw new Error("no JSON object found");
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return s.slice(start, i + 1);
  }
  throw new Error("unterminated JSON");
}
