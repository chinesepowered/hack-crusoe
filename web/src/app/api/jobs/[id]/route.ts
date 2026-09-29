import { getJob } from "@/engine/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = getJob(id);
  return job ? Response.json(job) : Response.json({ error: "not found" }, { status: 404 });
}
