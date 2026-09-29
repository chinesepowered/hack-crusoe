import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./config";
import "./net";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
export const FONT_DIR = path.join(DATA_DIR, "fonts");

/**
 * Download a Google Font family once and serve it locally, so renders never depend on the network.
 * Returns the stylesheet file name (inside FONT_DIR), or undefined if the family is not on Google Fonts.
 */
export async function ensureFont(family: string): Promise<string | undefined> {
  if (!family || /^(system-ui|sans-serif|serif|monospace|-apple-system|Times New Roman|Arial|Helvetica)$/i.test(family)) return;
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const slug = family.replace(/[^a-z0-9]+/gi, "_");
  const cssName = `${slug}.css`;
  const cssFile = path.join(FONT_DIR, cssName);
  if (fs.existsSync(cssFile)) return cssName;
  try {
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700;800;900&display=block`, { headers: { "user-agent": UA } });
    if (!res.ok) {
      // Some families lack the full weight range; try the default weight set.
      const alt = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=block`, { headers: { "user-agent": UA } });
      if (!alt.ok) return;
      return save(await alt.text());
    }
    return save(await res.text());
  } catch {
    return;
  }

  async function save(css: string) {
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
    for (const u of urls) {
      const name = crypto.createHash("sha1").update(u).digest("hex").slice(0, 16) + ".woff2";
      const f = path.join(FONT_DIR, name);
      if (!fs.existsSync(f)) {
        const r = await fetch(u);
        if (!r.ok) continue;
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      }
      css = css.split(u).join(name);
    }
    fs.writeFileSync(cssFile, css);
    return cssName;
  }
}
