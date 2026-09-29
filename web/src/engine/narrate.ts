import "./net";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR, eleven } from "./config";
import { audioDuration } from "./media";

/** Text to speech with ElevenLabs, cached by (text, voice, model) so re-renders never re-bill. */
export async function speak(text: string, voiceId = eleven.voiceId): Promise<{ file: string; duration: number }> {
  if (!eleven.apiKey) throw new Error("ELEVENLABS_API_KEY is not set.");
  const clean = text.replace(/<[^>]+>/g, "").trim();
  const hash = crypto.createHash("sha1").update(`${clean}|${voiceId}|${eleven.model}`).digest("hex").slice(0, 16);
  const dir = path.join(DATA_DIR, "tts-cache");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${hash}.mp3`);
  if (!fs.existsSync(file)) {
    let delay = 1500;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": eleven.apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          text: clean,
          model_id: eleven.model,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
        }),
      });
      if (res.ok) {
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        break;
      }
      if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }
  return { file, duration: await audioDuration(file) };
}
