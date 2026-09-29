// Make Node's fetch honor HTTPS_PROXY / NO_PROXY when they are set (sandboxes, corporate networks).
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

const g = globalThis as unknown as { __reelNet?: boolean };
if (!g.__reelNet && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
  g.__reelNet = true;
}
