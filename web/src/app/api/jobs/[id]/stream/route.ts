import { getJob, subscribe } from "@/engine/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-sent events: a full job snapshot whenever it changes (throttled). */
export async function GET(req: Request, ctx: RouteContext<"/api/jobs/[id]/stream">) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return new Response("not found", { status: 404 });
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let off = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const push = () => {
        timer = null;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(getJob(id))}\n\n`));
        } catch {
          off();
        }
      };
      push();
      off = subscribe(id, () => {
        if (!timer) timer = setTimeout(push, 250);
      });
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          clearInterval(ping);
        }
      }, 15000);
      req.signal.addEventListener("abort", () => {
        off();
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      off();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
