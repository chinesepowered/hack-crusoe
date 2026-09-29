import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The render engine drives a real browser and ffmpeg; keep those out of the bundler.
  serverExternalPackages: ["playwright", "playwright-core", "ffmpeg-static", "ffprobe-static", "undici"],
};

export default nextConfig;
