import { z } from "zod";
import { startJob } from "@/engine/agents";
import { listJobs } from "@/engine/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["website", "expo"]),
  target: z.string().min(3),
  cuts: z.array(z.enum(["short", "main"])).min(1),
  founderNotes: z.string().max(2000).optional(),
  requireApproval: z.boolean().default(true),
  voiceId: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const input = parsed.data;
  if (input.kind === "website") {
    try {
      const u = new URL(/^https?:\/\//.test(input.target) ? input.target : `https://${input.target}`);
      input.target = u.toString();
    } catch {
      return Response.json({ error: "That does not look like a website URL." }, { status: 400 });
    }
  }
  const job = await startJob(input);
  return Response.json({ id: job.id });
}

export async function GET() {
  return Response.json(
    listJobs()
      .slice(0, 30)
      .map((j) => ({
        id: j.id,
        createdAt: j.createdAt,
        status: j.status,
        target: j.input.target,
        kind: j.input.kind,
        name: j.understanding?.name ?? j.capture?.name,
        thumb: j.outputs[0]?.thumb,
      })),
  );
}
