# LaunchReel

**Paste a website URL or an Expo React Native repo, and a crew of five AI agents turns it into YouTube-ready launch videos.**
The crew captures the real product in a real browser, writes the script, critiques every rendered frame, and hands you a vertical Short plus a 1-minute promo.
Each run also includes captions, a thumbnail and the YouTube title, description and tags. The crew runs on open models on Crusoe and coordinates in a Band room.

## The problem

Small teams ship products in days, then either lose a weekend in a video editor or post nothing. With no video there's no YouTube Short, no Play Store promo video and no launch post, so most indie apps and side projects launch to silence. Existing AI video tools want you to write the script and upload the footage yourself, and nobody checks whether the result is readable or even true.

## Our solution

| Step | Agent | What happens |
|---|---|---|
| 1. Direct | **Reel Director** | Reads the request and **recruits a scout at runtime**: the Web Scout for a URL, or the App Scout for an Expo project. |
| 2. Capture | **Web Scout / App Scout** | Opens the product in a real Chromium browser. For Expo, it builds the app for web with `expo export`, then taps through tabs and buttons, keeping each new screen. A vision model reads the screenshots and writes a product brief. |
| 3. Write | **Storyboard Writer** | Writes scenes, voiceover, captions and YouTube metadata for each cut, then renders a still of every scene. |
| 4. Critique | **Frame Critic** | Looks at the **real rendered frames**, not JSON. It **blocks** unreadable text, screenshots that don't match the claim, and facts that aren't in the source. The Writer must fix and resubmit, up to 2 rounds. |
| 5. Approve | **You** | The Director asks you in the room. Reply "approve", or ask for changes in plain English. |
| 6. Produce | **Producer** | Narrates (ElevenLabs), renders every frame deterministically in headless Chromium, mixes a generated music bed with ducking, and masters to -14 LUFS for YouTube. |

Output per run: `short.mp4` (1080x1920), `main.mp4` (1920x1080), `.srt` captions, `thumbnail.jpg`, and a `youtube.txt` with the title, description and tags.

## Sponsor summary

| Sponsor | Used for | Where in the code |
|---|---|---|
| **Crusoe** (Serverless Inference) | Every model call: planning, vision, writing and critique, via open models behind Crusoe's OpenAI-compatible API | `web/src/engine/llm.ts`, `web/src/engine/config.ts` |
| **Band** | The crew's coordination layer: 6 registered agents, one room per job, @mention handoffs, runtime recruitment, the critic's veto and the human approval gate | `web/src/engine/band.ts`, `web/src/engine/crew.ts`, `web/scripts/band-setup.mts` |
| **ElevenLabs** (not a prize sponsor) | Voiceover ("Sapphire", young female voice) | `web/src/engine/narrate.ts` |

## Sponsor specifics

### Crusoe

- One OpenAI-compatible client pointed at `https://api.inference.crusoecloud.com/v1`, with a model for each job:
  - **DeepSeek-V4-Flash** handles planning and routing (fast, cheap, good at structured JSON).
  - **GLM-5.3** writes the storyboard, a long structured generation with strict constraints.
  - **Qwen3.8-27B** (multimodal) does both vision jobs: reading product screenshots, and critiquing rendered frames.
- Retries with backoff on 429/503. Model roles are spread across different models, so Crusoe's per-model rate limits don't collide.
- A live cost counter: every call's token usage is recorded and shown per job ("Model spend", "tokens").
- To switch provider, set `LLM_BASE_URL`, `LLM_API_KEY` and `MODEL_*` in `web/.env.local`. We developed against another OpenAI-compatible endpoint and switch to Crusoe for the demo; the code doesn't change.

### Band

The crew has six agents, each registered as its own Band identity with its own API key (`pnpm band:setup`): Reel Director, Web Scout, App Scout, Storyboard Writer, Frame Critic and Producer.

- **One room per job.** The Director creates it and adds you and the core crew.
- **Runtime recruitment.** The scout is **not** in the room at the start. The Director decides from the input (website or Expo app) which specialist the job needs, and adds it mid-conversation.
- **Dependent handoffs.** Every step is a Band message that @mentions the next agent. Each agent polls only its own inbox (`GET /agent/chats/{id}/messages/next`) and acts only on what it was mentioned in. The Writer's work depends on the Scout's brief; the Writer's revision depends on the Critic's specific findings.
- **A critic that can veto.** The Frame Critic replies `BLOCKED` with numbered fixes, and nothing reaches the Producer until the critic approves (or the revision limit escalates to you).
- **One human gate.** Rendering waits for your approval, which you give in the Band room, or from the web UI, which posts to the room as you.
- **Visible execution.** Tool calls, results, thoughts and errors are posted as Band events, so the room is a replayable record of the run.
- **The delete test.** Remove the Band room and no agent ever receives work: the handoffs, the recruit, the veto and the approval all travel as Band messages. (A local in-process transport exists only as a fallback for running without Band credentials.)

A typical flow:

```
You: "Make a Short and a 1-minute promo for convert.chinesepowered.com"
 -> @Reel Director recruits Web Scout into the room
 -> @Web Scout captures 4 pages, Qwen reads them, reports the brief
 -> @Storyboard Writer writes 2 cuts, renders 15 stills
 -> @Frame Critic BLOCKED: "scene 3 shows a browser error page"
 -> @Storyboard Writer revises -> @Frame Critic APPROVED
 -> @you "approve" -> @Producer narrates, renders, masters -> videos ready
```

## Run it

```bash
cd web
pnpm install
pnpm exec playwright install chromium      # once
cp .env.example .env.local                  # add your keys
pnpm band:setup                             # optional: registers the crew on Band
pnpm dev                                    # http://localhost:3000
# or headless: pnpm reel https://yourproduct.com --both
```

Expo projects: paste a git URL or a local folder path. The project is copied into `web/.data` (gitignored, with `.env` files skipped), installed with **npm**, and exported for web. Only screenshots, visible text and the README go to the model provider.

## Pitch materials

- `pitch/launchreel-pitch.mp4`: the 3-minute pitch video, rendered by LaunchReel's own engine.
- `slides.html`: a 4-slide deck (open in a browser, use the arrow keys).
