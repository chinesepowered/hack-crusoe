import "./net";
import OpenAI from "openai";
import { llm } from "./config";
import { addUsage, type Job } from "./store";

export type Role = keyof typeof llm.models;

let client: OpenAI | null = null;
function api() {
  if (!llm.apiKey) throw new Error("LLM_API_KEY is not set. Add it to web/.env.local.");
  client ??= new OpenAI({ baseURL: llm.baseURL, apiKey: llm.apiKey, maxRetries: 0 });
  return client;
}

type Part = OpenAI.Chat.Completions.ChatCompletionContentPart;

export type Ask = {
  job: Job;
  role: Role;
  system: string;
  user: string;
  /** Images as data URLs (JPEG/PNG). Only for the vision role. */
  images?: string[];
  maxTokens?: number;
};

/** One chat completion with retries on 429/503 and usage accounting for the cost ticker. */
export async function ask({ job, role, system, user, images = [], maxTokens = 12000 }: Ask): Promise<string> {
  const model = llm.models[role];
  const content: string | Part[] = images.length
    ? [{ type: "text", text: user }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
    : user;

  let delay = 1500;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await api().chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature: 0.6,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      });
      const u = res.usage;
      if (u) {
        const [pin, pout] = llm.prices[role];
        addUsage(job, {
          role,
          model,
          input: u.prompt_tokens,
          output: u.completion_tokens,
          usd: (u.prompt_tokens * pin + u.completion_tokens * pout) / 1e6,
        });
      }
      const text = res.choices[0]?.message?.content;
      if (!text) throw new Error(`${model} returned no content (finish: ${res.choices[0]?.finish_reason}).`);
      return text;
    } catch (e) {
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
