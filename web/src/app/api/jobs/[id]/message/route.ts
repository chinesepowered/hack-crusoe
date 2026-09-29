import { humanSays } from "@/engine/agents";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/message">) {
  const { id } = await ctx.params;
  const { text } = (await req.json()) as { text?: string };
  if (!text?.trim()) return Response.json({ error: "empty message" }, { status: 400 });
  try {
    await humanSays(id, text.trim());
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
