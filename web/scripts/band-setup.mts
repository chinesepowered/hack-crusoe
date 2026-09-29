// Registers the crew as Band agents on your account (idempotent) and writes their ids and keys to .env.local.
// Needs BAND_USER_KEY in .env.local. Run: pnpm band:setup
import fs from "node:fs";
import { humanApi } from "../src/engine/band";
import { ROLES } from "../src/engine/crew";

const key = process.env.BAND_USER_KEY;
if (!key) throw new Error("Set BAND_USER_KEY in .env.local first.");
const api = humanApi(key);
const me = (await api.me())!.data.user;
const existing = (await api.agents())!.data;
const envFile = ".env.local";
let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const setVar = (k: string, v: string) => {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), line) : env.trimEnd() + "\n" + line + "\n";
};
setVar("BAND_HUMAN_ID", me.id);
setVar("BAND_HUMAN_HANDLE", me.handle);
for (const [role, r] of Object.entries(ROLES)) {
  const K = role.toUpperCase();
  const have = new RegExp(`^BAND_${K}_KEY=.+$`, "m").test(env);
  const found = existing.find((a) => a.name === r.name);
  if (found && have) {
    console.log(`= ${r.name} already set up (${found.id})`);
    continue;
  }
  if (found && !have) {
    console.log(`! ${r.name} exists on Band but its key is not in .env.local. Delete it in the Band UI (or reuse its key) and re-run.`);
    continue;
  }
  const res = (await api.register(r.name, r.blurb))!.data;
  setVar(`BAND_${K}_ID`, res.agent.id);
  setVar(`BAND_${K}_KEY`, res.credentials.api_key);
  console.log(`+ registered ${r.name} (${res.agent.id})`);
}
fs.writeFileSync(envFile, env);
console.log("Done. Band human:", me.handle);
