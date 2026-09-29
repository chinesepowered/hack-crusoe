# Hack Day 2026 — what to build (15 ideas, ranked by expected cash)

## Prize math (cash only)

| Prize | Cash | Hard requirement |
|---|---|---|
| Overall 1st / 2nd / 3rd (Crusoe) | $5,000 / $3,000 / $2,000 | Must use Crusoe. Judge wants "actually useful". |
| Best Use of BAND | $1,000 | Coordination must happen *in* a Band room (delete test). Show ≥1 of: dependent handoff, runtime recruit, enforced boundary, critic veto. Live room + execution events in demo. |
| Best Use of Plaud / 2nd | $1,000 / $500 | Plaud recording is genuinely the input. |
| DuploCloud Best Agent | $750 gift card | Agent runs its full task live. No Duplo product required. |
| DuploCloud Most Sponsor Tools | $750 gift card | Count of sponsor tools *actively doing work*. |
| Neo4j (3 prizes) | credits, not cash | Only worth it as a +1 to the sponsor-tool count. |

Max addressable for one project: **$9,000** (1st + Band + Plaud 1st + both Duplo). The overall prize dominates, so every idea below is judged first on "would the Crusoe judge call this useful", second on how many side prizes it sweeps for free.

## What the docs actually give us (facts that shape the ideas)

**Crusoe**
- Serverless Inference is OpenAI-compatible at `https://api.inference.crusoecloud.com/v1`. Models we care about: `deepseek-ai/DeepSeek-V4-Flash` (cheap, 1M ctx, agentic), `zai/GLM-5.3` (coding), `qwen/Qwen3.8-27B` (multimodal), `nvidia/Nemotron-3-Super-120B-A12B`, `nvidia/Nemotron-3-Nano-Omni-Reasoning-30B-A3B` (omni), `nvidia/Nemotron-3-VoiceChat` (speech-to-speech, **WebSocket**, not chat completions — untested, treat as risky).
- Rate limits: 30 RPM / 500k TPM per model without a card on file, 600 RPM / 2M TPM with one. **Add a payment method before the event.** 503s happen even under limit; build retry with backoff.
- Serverless Fine-Tuning: LoRA on Qwen3.5-2B/4B/9B, Llama-3.1-8B, gpt-oss-20b, Qwen3.8-27B, DeepSeek-V4-Flash etc. Then Self-Serve Deployment. This is the "deep Crusoe" differentiator almost nobody else will touch.
- Crusoe Cloud MCP server (`npx -y @crusoeai/cloud-mcp`): read-only tools over real infra (VMs, disks, quotas, GPU tracking, audit logs, usage). Plus CLI/Terraform for writes. Lets an agent touch *Crusoe infrastructure*, not just Crusoe models.

**Band**
- Python SDK `band-sdk`. `LangGraphAdapter(llm=BaseChatModel)` accepts any LangChain model, so `ChatOpenAI(base_url=crusoe, model="zai/GLM-5.3")` makes **every Band agent run on Crusoe models**. Also `PydanticAIAdapter`.
- Platform tools come free: `band_send_message`, `band_send_event`, `band_lookup_peers`, `band_add_participant`, `band_create_chatroom`. Each role must be its own registered agent (own UUID + key). Keep execution events on during the demo.
- Judges score four signals: dependent handoff, roster decided at runtime, boundary enforced, verdict that can be BLOCKED. Explicitly end on a human approving/blocking in the room.

**Plaud**
- No public REST API. There is **Plaud MCP** (`npx -y @plaud-ai/mcp@latest`) with `list_files`, `get_file` (presigned audio URL + transcript segments with speakers + notes), `get_note`, `get_transcript`. OAuth login once. Plaud Embedded transcription API is research preview.
- Demo plan: fetch once via MCP, cache the JSON + audio in the repo, run the demo from cache with a "refetch live" button. Device failing on stage costs nothing.

**DuploCloud**
- Their AI HelpDesk accepts "Bring Your Own Agent": any HTTP service exposing `POST /api/sendMessage` with `{messages:[{role, content, platform_context, data}]}`. Registering our agent there is ~1 hour of work and makes Duplo a real integration (ticket → our agent → result). Also a Duplo MCP server exists.
- Both Duplo prizes are judged on "does the agent actually do the job live", not on Duplo usage.

---

## The 15 ideas

Scoring: **Useful** (Crusoe judge), **Demo risk** (lower is better), **Prizes it can plausibly sweep**, **Rough EV** (my estimate of expected cash for a strong team executing well; treat as relative ranking, not a forecast).

### 1. Meeting → Shipped: Plaud recording becomes merged PRs + infra changes  ⭐ RECOMMENDED
Record a 3-minute engineering sync on the Plaud. A Band crew turns the *decisions* into work that lands: a PR on GitHub, an infra change on Crusoe, a doc update — each traced back to the sentence in the meeting that authorized it.
- **Crew (Band, all on Crusoe models):** Scribe (DeepSeek-V4-Flash: decisions, owners, action items with quotes) → Coordinator (`band_lookup_peers` + `band_add_participant` recruits only the specialists this meeting needs) → Engineer (GLM-5.3 writes code, opens PR) / InfraOps (Crusoe CLI or Terraform: e.g. create a firewall rule or resize a disk, reads state via Crusoe MCP) / Writer → Critic (Nemotron Super: "BLOCKED — nobody in the meeting agreed to change the schema; quote missing") → Human gate: you type APPROVE in the room and the PR merges / the change applies.
- **Why it wins:** it's the single most relatable "actually useful" story in the room; every one of Band's four signals is present naturally; Plaud is the honest input; Duplo gets a BYO-agent registration (tickets created from action items → our agent executes); Neo4j stores the commitment graph across meetings if time permits.
- Useful: very high · Demo risk: low-medium (keep the code task tiny and pre-tested; transcript cached) · Prizes: Overall, Band, Plaud, both Duplo.
- **EV: highest.** Build plan at the bottom.

### 2. Incident War-Room: voice bridge → root cause → approved fix
On-call gets paged; the incident call is recorded on Plaud (or a watcher agent opens the room itself — Band's trip-wire pattern). Agents: Triage (reads Crusoe Command Center metrics/logs via Crusoe MCP), Correlator, Fixer (proposes kubectl/CLI), Critic (blocks destructive commands), Duplo HelpDesk agent executes after human approval.
- Useful: very high for DevOps judges (Duplo will love it). Demo risk: medium-high — you need a live broken system to fix; fake it with a Crusoe VM running a deliberately misconfigured service.
- Prizes: Overall, Band, Duplo x2, Plaud (weaker: Plaud is optional here). EV: high.

### 3. "Say it, Provision it": spoken infra intent → Terraform → live Crusoe resources
Plaud voice memo: "we need a 2-node L40S cluster for the fine-tune tonight, budget $400". Planner turns it into Crusoe Terraform, Cost agent checks against `get_gpu_tracking`/quotas via Crusoe MCP, Critic blocks anything over budget, human approves in Band, apply runs and the VM appears in the Crusoe console on the projector.
- Useful: high, and it flatters Crusoe's infra story (VMs, quotas, spot, Terraform). Demo risk: medium (provision a small CPU VM live; takes ~1 min; have a pre-provisioned fallback).
- Prizes: Overall (strong with Crusoe judge), Band, Plaud (medium), Duplo (medium). EV: high. Could be the "InfraOps" agent inside idea 1.

### 4. Model Deprecation Migrator (an agent Crusoe itself would use)
Crusoe just deprecated 5 serverless models (Sept 12). An agent scans a repo (or GitHub org), finds hardcoded model IDs, picks the documented migration path, runs a side-by-side eval on Crusoe (old prompt outputs vs new model), and opens a PR with the eval attached. Band: Migrator + Evaluator + Critic that blocks the PR if quality regresses.
- Useful: very high *to Crusoe specifically*, small, real, and fully demoable live. No Plaud fit.
- Prizes: Overall (judge-bait), Band, Duplo Best Agent. EV: medium-high. Great fallback if the team is small.

### 5. Private Model Factory: meetings → training data → Crusoe LoRA → deployed
Take a pile of Plaud transcripts, have agents synthesize a domain dataset (e.g. "our team's style of meeting notes"), submit a Crusoe Serverless Fine-Tuning job on Qwen3.5-4B, deploy via Self-Serve Deployment, and let a Band panel (Judge, Skeptic) A/B the fine-tuned model vs the base live.
- Useful: high for anyone wanting a cheap private model; deepest Crusoe usage in the room (inference + fine-tune + deploy). Demo risk: medium — run the fine-tune the night before, show the job page and the deployed endpoint answering live.
- Prizes: Overall (technical depth), Plaud (data source), Band (weaker). EV: medium-high. A fine-tuned "Scribe" could be a bolt-on to idea 1 for the Crusoe judge.

### 6. Site-Walk Inspector: voice notes + photos → inspection report
Walk a site (or the conference floor) dictating into the Plaud while snapping photos. Qwen3.8-27B (multimodal) reads the photos, Flash aligns them with the timestamps in the transcript, Reporter drafts the inspection/punch-list, Critic blocks any finding not supported by a photo or a quote. Optional Neo4j asset graph.
- Useful: high in construction/property/insurance. Demo risk: low (all inputs pre-recorded). Plaud is genuinely central; the device's "walk and talk" use case shines.
- Prizes: Plaud (strong), Overall (medium), Band (critic + handoff). EV: medium-high.

### 7. Sales Call → CRM, follow-up, and a "did we over-promise?" critic
Plaud records a sales call. Extractor pulls needs/objections/commitments, Enricher looks up the company, Drafter writes the follow-up, Critic blocks any promise the rep didn't actually make. Pushes to a CRM (or Neo4j relationship graph).
- Useful: high but well-trodden; every note-taker does 80% of this. Demo risk: low.
- Prizes: Plaud (strong), Band (critic), Overall (medium-low: judge has seen it). EV: medium.

### 8. Conference Hallway Brain (built at the conference, about the conference)
Team members record consented conversations at the AI Conference on Plaud; agents build a Neo4j graph of people ↔ companies ↔ topics ↔ asks, and a Matchmaker recruits a "who should you meet next" specialist per query. Qwen multimodal reads badge/business-card photos.
- Useful: fun and on-theme; judges will smile. Demo risk: low. Privacy: only record your own team and consenting people.
- Prizes: Plaud (strong), Neo4j (all three, credits), Band (runtime recruit), Overall (medium). EV: medium.

### 9. Commitment Tracker across meetings (who promised what, and did it happen)
Every Plaud meeting feeds a Neo4j graph of commitments → owners → due dates → evidence (PR merged, ticket closed). Before the next meeting a Band crew posts "3 commitments slipped; here's who to nudge", with a Critic vetoing false "done" claims by checking GitHub/Duplo tickets.
- Useful: high for managers. Demo risk: low (needs 2–3 cached meetings). Natural extension of idea 1.
- Prizes: Plaud, Neo4j, Band, Overall (medium-high). EV: medium-high.

### 10. Voice-native DevOps copilot with Nemotron-3-VoiceChat
Talk to your Crusoe infra in real time; VoiceChat (speech-to-speech, function calling) calls Crusoe MCP tools and a Duplo agent to act. Very flashy for Crusoe/NVIDIA.
- Useful: medium. Demo risk: **high** — WebSocket model you haven't tested, unknown latency, conference Wi-Fi. Only attempt if you validate it works the day before; otherwise degrade to text.
- Prizes: Overall (if it works), Duplo. EV: low-medium because of variance.

### 11. Planner / Engineer / Reviewer on three different Crusoe models
Band's own example: a coding crew where GLM-5.3 engineers, DeepSeek-Flash plans, Nemotron reviews with veto. Repo mounted in a sandbox.
- Useful: high but generic (every "agent swarm codes" demo). Demo risk: medium. No Plaud.
- Prizes: Band (safe), Overall (medium). EV: medium.

### 12. Contract review: Reader → Advocate vs Adversary → Senior redline, Plaud for the negotiation call
Extract clauses from a PDF, two agents argue each side, a Senior reconciles a redline; the Plaud recording of the negotiation call supplies what was verbally agreed so the Critic can flag drift between the call and the paper.
- Useful: high for legal; Band pattern is textbook. Demo risk: low-medium. Plaud fit is real but secondary.
- Prizes: Band, Overall (medium), Plaud (medium). EV: medium.

### 13. Support ticket swarm with runtime recruitment (Duplo HelpDesk front end)
Tickets arrive in Duplo's HelpDesk; our BYO agent receives them, a Coordinator recruits the right specialist (billing, infra, code) per ticket, Critic vetoes, resolution posted back to the ticket.
- Useful: medium (generic). Demo risk: low. Best possible fit for both Duplo prizes.
- Prizes: Duplo x2, Band. Overall: low-medium. EV: medium-low.

### 14. Paper → Reproduction on Crusoe GPUs
Qwen multimodal reads a paper's figures/tables, Engineer writes the training script, a Runner launches it on a Crusoe GPU VM, a Critic compares the produced numbers against the paper's claims.
- Useful: high for researchers; very "Crusoe" (GPUs + models). Demo risk: **high** (long runs, GPU quota, debugging live). Pre-run and replay.
- Prizes: Overall (if it lands), Band. EV: low-medium.

### 15. Self-improving eval loop: agents generate evals, pick the best Crusoe model, fine-tune the loser
A Band panel writes eval cases for a task, runs every Crusoe model, and kicks off a LoRA fine-tune on the cheapest model that failed; posts a cost/quality frontier chart.
- Useful: medium (tooling for tooling). Demo risk: medium (fine-tune must be pre-run). Deep Crusoe.
- Prizes: Overall (technical), Band. EV: low-medium.

---

## Ranking summary

| # | Idea | Useful | Demo risk | Overall | Band | Plaud | Duplo | Rel. EV |
|---|---|---|---|---|---|---|---|---|
| 1 | Meeting → Shipped | ★★★★★ | low-med | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | 1 |
| 2 | Incident war-room | ★★★★★ | med-high | ★★★★ | ★★★★ | ★★ | ★★★★★ | 2 |
| 3 | Say it, Provision it | ★★★★ | med | ★★★★★ | ★★★★ | ★★★ | ★★★ | 3 |
| 9 | Commitment tracker | ★★★★ | low | ★★★★ | ★★★★ | ★★★★★ | ★★ | 4 |
| 5 | Private model factory | ★★★★ | med | ★★★★ | ★★ | ★★★★ | ★ | 5 |
| 4 | Deprecation migrator | ★★★★ | low | ★★★★ | ★★★ | — | ★★★ | 6 |
| 6 | Site-walk inspector | ★★★★ | low | ★★★ | ★★★ | ★★★★★ | ★ | 7 |
| 7 | Sales call critic | ★★★ | low | ★★ | ★★★ | ★★★★ | ★ | 8 |
| 8 | Hallway brain | ★★★ | low | ★★★ | ★★★ | ★★★★ | ★ | 9 |
| 12 | Contract review | ★★★★ | low-med | ★★★ | ★★★★ | ★★ | ★ | 10 |
| 11 | 3-model coding crew | ★★★ | med | ★★★ | ★★★★ | — | ★★ | 11 |
| 13 | Ticket swarm | ★★ | low | ★★ | ★★★ | — | ★★★★★ | 12 |
| 10 | VoiceChat DevOps | ★★★ | high | ★★★ | ★★ | — | ★★★ | 13 |
| 15 | Self-improving evals | ★★ | med | ★★★ | ★★ | — | ★ | 14 |
| 14 | Paper reproduction | ★★★★ | high | ★★★ | ★★ | — | ★ | 15 |

---

## Recommendation: build #1, with #3 as its InfraOps agent and #9 as the stretch

One narrative, one room, every sponsor doing real work:

> "We recorded our standup on a Plaud. Twelve minutes later the two things we decided are a merged PR and a firewall rule on Crusoe, and the thing we *didn't* decide got blocked by the critic."

### Architecture (all Python, one repo)
```
plaud/            fetch.py  -> Plaud MCP client; caches transcript.json + audio.mp3; --live flag
crusoe/           llm.py    -> OpenAI client @ api.inference.crusoecloud.com/v1, retry/backoff on 429/503
                  infra.py  -> Crusoe MCP (read) + `crusoe` CLI / Terraform (write)
agents/           scribe.py coordinator.py engineer.py infraops.py critic.py   (one Band agent each, own UUID)
duplo/            server.py -> FastAPI: POST /api/sendMessage  (BYO agent endpoint; tickets -> coordinator)
graph/            neo4j.py  -> commitments graph (stretch)
demo/             cached transcript, seeded target repo, demo script
```

Model assignment (talking point for the Crusoe judge: "right model for each job"):
- Scribe → `deepseek-ai/DeepSeek-V4-Flash` (cheap, long context, structured JSON output)
- Engineer → `zai/GLM-5.3` (code)
- InfraOps → `deepseek-ai/DeepSeek-V4-Flash` with Crusoe MCP tools
- Critic → `nvidia/Nemotron-3-Super-120B-A12B` or `qwen/Qwen3.8-27B` (different family than the workers, so it isn't grading its own homework)
- Stretch: fine-tuned Qwen3.5-4B Scribe via Serverless Fine-Tuning, deployed on Self-Serve — "we trained it on our own meetings last night".

### Band signals, mapped to the demo
1. **Dependent handoff:** Engineer receives the *decision* + quote from Scribe, not the whole transcript.
2. **Runtime recruit:** Coordinator calls `band_lookup_peers` and only adds InfraOps because this meeting mentioned a firewall; a meeting without infra talk never recruits it.
3. **Veto:** Critic replies `BLOCKED: <missing quote>` on one deliberately unsupported action item (plant one in the recording: someone muses "we should probably migrate to Postgres" with no decision).
4. **Human gate:** you type `APPROVE PR-1` in the room; nothing merges or applies without it.

### Demo script (≈4 min)
1. Show the Plaud, play 10 seconds of the real audio, show the cached transcript (mention it was pulled via Plaud MCP).
2. Post `@Scribe process meeting 2026-09-29` in the Band room. Scribe posts 3 action items with quotes.
3. Coordinator recruits Engineer + InfraOps live (participant appears in the panel).
4. Engineer opens a PR (show GitHub tab). InfraOps proposes `crusoe networking vpc-firewall-rules create ...`.
5. Critic BLOCKs the Postgres item, approves the other two.
6. You `APPROVE`; PR merges; firewall rule appears in the Crusoe console.
7. Flip to the Duplo HelpDesk: the same action items arrived as tickets and closed themselves.

### Risk controls
- Cache everything from Plaud; `--live` only if the device cooperates that morning.
- Target repo is tiny and the code task is one you've already seen GLM-5.3 solve three times.
- Infra write is cheap and reversible (firewall rule or VM tag), with a pre-created fallback screenshot.
- Add a payment method to Crusoe now for 600 RPM; wrap every call in backoff; keep a second model as fallback for each role.
- Record a full backup video of the working demo the night before.

### Build order (cut from the bottom if time runs out)
1. Crusoe client + Scribe extraction from cached transcript (2h)
2. Band agents registered, Scribe → Coordinator → Engineer handoff, PR opens (3h)
3. Critic with veto + human gate (1.5h)
4. InfraOps via Crusoe MCP/CLI, runtime recruit (2h)
5. Duplo BYO-agent endpoint + one ticket round-trip (1.5h)
6. Neo4j commitment graph, fine-tuned Scribe (stretch)
