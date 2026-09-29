import { band, eleven, llm } from "@/engine/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    provider: llm.provider,
    models: llm.models,
    band: band.enabled && Object.keys(band.agents).length >= 5,
    voice: !!eleven.apiKey,
    llm: !!llm.apiKey,
  });
}
