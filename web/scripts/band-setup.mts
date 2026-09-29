// Registers the crew as Band agents on your account (idempotent) and writes their ids and keys to .env.local.
// Needs BAND_USER_KEY in .env.local. Run: pnpm band:setup
//
// Band shows an agent's API key only once, at registration, and agent names are unique per account.
// So when a crew agent already exists but its key is not in .env.local (new machine, lost file), copy the
// BAND_<ROLE>_ID and BAND_<ROLE>_KEY lines from the .env.local where setup first ran.
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
const getVar = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const setVar = (k: string, v: string) => {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), line) : env.trimEnd() + "\n" + line + "\n";
};
setVar("BAND_HUMAN_ID", me.id);
setVar("BAND_HUMAN_HANDLE", me.handle);
let missing = 0;
for (const [role, r] of Object.entries(ROLES)) {
  const K = role.toUpperCase();
  const id = getVar(`BAND_${K}_ID`);
  const haveKey = !!getVar(`BAND_${K}_KEY`);
  const found = existing.find((a) => a.name === r.name);
  if (found && haveKey && id === found.id) {
    console.log(`= ${r.name} already set up (${found.id})`);
    continue;
  }
  if (found) {
    missing++;
    console.log(`! ${r.name} exists on Band (${found.id}) but .env.local has no key for it. Copy BAND_${K}_ID and BAND_${K}_KEY from the .env.local where setup first ran.`);
    continue;
  }
  const res = (await api.register(r.name, r.blurb))!.data;
  setVar(`BAND_${K}_ID`, res.agent.id);
  setVar(`BAND_${K}_KEY`, res.credentials.api_key);
  console.log(`+ registered ${r.name} (${res.agent.id})`);
}
fs.writeFileSync(envFile, env);
console.log(missing ? `${missing} agent key(s) still missing, see above.` : `Done. Band human: ${me.handle}`);
