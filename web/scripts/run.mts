// Run one job from the command line and stream the crew room: pnpm reel <url|expo-path> [--expo] [--short|--main|--both] [--no-approval]
import { startJob } from "../src/engine/agents";
import { getJob } from "../src/engine/store";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
if (!target) throw new Error("usage: pnpm reel <url or expo project> [--expo] [--short|--main|--both]");
const cuts = args.includes("--main") ? ["main"] : args.includes("--both") ? ["short", "main"] : ["short"];
const job = await startJob({
  kind: args.includes("--expo") ? "expo" : "website",
  target,
  cuts: cuts as ("short" | "main")[],
  requireApproval: false,
});
console.log("job", job.id);
let seen = 0;
while (true) {
  const j = getJob(job.id)!;
  for (const m of j.messages.slice(seen)) console.log(`[${m.from}${m.to.length ? " -> " + m.to.join(",") : ""}${m.eventType ? " " + m.eventType : ""}] ${m.text.slice(0, 400)}`);
  seen = j.messages.length;
  if (j.status === "done" || j.status === "failed") {
    console.log(j.status, j.error ?? "", JSON.stringify(j.outputs), "cost $" + j.usage.reduce((a, u) => a + u.usd, 0).toFixed(4));
    process.exit(j.status === "done" ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
