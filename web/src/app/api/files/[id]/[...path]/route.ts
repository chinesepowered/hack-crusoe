import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { jobDir } from "@/engine/store";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".srt": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp" };

/** Serves job files (screenshots, stills, videos) with byte-range support for video seeking. */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]/[...path]">) {
  const { id, path: parts } = await ctx.params;
  if (!/^[a-z0-9]+$/.test(id)) return new Response("bad id", { status: 400 });
  const root = path.resolve(jobDir(id));
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response("not found", { status: 404 });
  const size = fs.statSync(file).size;
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const download = new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-store" };
  if (download) headers["content-disposition"] = `attachment; filename="${path.basename(file)}"`;
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? parseInt(range[1]) : 0;
    const end = range[2] ? Math.min(parseInt(range[2]), size - 1) : size - 1;
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...headers, "content-length": String(size) } });
}
