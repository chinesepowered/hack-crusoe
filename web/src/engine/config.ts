import os from "node:os";
import path from "node:path";

const env = (k: string, d = "") => process.env[k] ?? d;

export const ROOT = process.cwd();
export const DATA_DIR = path.resolve(ROOT, env("DATA_DIR", ".data"));
export const PLAYER_DIR = path.resolve(ROOT, "src/engine/player");

/** One OpenAI-compatible endpoint. Test with any provider, switch to Crusoe for the demo. */
export const llm = {
  baseURL: env("LLM_BASE_URL", "https://api.inference.crusoecloud.com/v1"),
  apiKey: env("LLM_API_KEY"),
  provider: env("LLM_PROVIDER_LABEL", "Crusoe"),
  // Default IDs are exactly as Crusoe's GET /v1/models lists them.
  models: {
    /** Planning, routing, copy. Cheap and good at tool-style JSON. */
    fast: env("MODEL_FAST", "deepseek-ai/Deepseek-V4-Flash"),
    /** Structured storyboard writing. */
    writer: env("MODEL_WRITER", "zai-org/GLM-5.3"),
    /** Reads screenshots and reviews rendered frames. */
    vision: env("MODEL_VISION", "Qwen/Qwen3.8-27B"),
  },
  /**
   * USD per million tokens, [input, output], from crusoe.ai/cloud/pricing. Used for the live cost counter.
   * Qwen3.8 27B has no published serverless price; the default is the Nemotron 3 Nano Omni multimodal rate,
   * a conservative estimate. Override with PRICE_<ROLE>="in,out".
   */
  prices: {
    fast: parsePrice(env("PRICE_FAST", "0.14,0.28")),
    writer: parsePrice(env("PRICE_WRITER", "1.40,4.40")),
    vision: parsePrice(env("PRICE_VISION", "0.30,1.83")),
  },
};

function parsePrice(s: string): [number, number] {
  const [a, b] = s.split(",").map(Number);
  return [a || 0, b || 0];
}

export const eleven = {
  apiKey: env("ELEVENLABS_API_KEY"),
  voiceId: env("ELEVENLABS_VOICE_ID", "tpS5zOAgWUiQMhzYbG2h"), // "Sapphire", young female
  model: env("ELEVENLABS_MODEL", "eleven_v4"),
};

/** Band: each crew member is its own registered Band agent (own id + API key). */
export const band = {
  enabled: env("BAND_ENABLED") === "1",
  /** Human API key of the approver's own account. Used to create the room and to post approvals as the human. */
  userKey: env("BAND_USER_KEY"),
  baseURL: env("BAND_BASE_URL", "https://app.band.ai"),
  /** Band user id of the human approver, so the crew can @mention them. */
  humanId: env("BAND_HUMAN_ID"),
  humanHandle: env("BAND_HUMAN_HANDLE"),
  agents: {} as Record<string, { id: string; key: string }>,
};
for (const role of ["DIRECTOR", "WEB_SCOUT", "APP_SCOUT", "LISTENER", "WRITER", "CRITIC", "PRODUCER"]) {
  const id = env(`BAND_${role}_ID`);
  const key = env(`BAND_${role}_KEY`);
  if (id && key) band.agents[role.toLowerCase()] = { id, key };
}

export const render = {
  fps: Number(env("RENDER_FPS", "30")),
  /** Parallel browser pages rendering frames. */
  workers: Number(env("RENDER_WORKERS", String(Math.max(1, Math.min(4, (os.cpus().length || 2) - 1))))),
  chromium: env("CHROMIUM_PATH"),
};
