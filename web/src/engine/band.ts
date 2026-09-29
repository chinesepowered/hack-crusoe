import "./net";
import { band } from "./config";

/** Minimal client for Band's Agent API (per-agent key) and Human API (the approver's own key). */
async function call<T>(key: string, method: string, path: string, body?: unknown): Promise<T | null> {
  let delay = 800;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${band.baseURL}${path}`, {
      method,
      headers: { "X-API-Key": key, "content-type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    if (res.ok) return (await res.json()) as T;
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    throw new Error(`Band ${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export type BandMessage = {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  chat_room_id: string;
};

export const agentApi = (key: string) => ({
  me: () => call<{ data: { id: string; name: string } }>(key, "GET", "/api/v1/agent/me"),
  createChat: (title: string) => call<{ data: { id: string } }>(key, "POST", "/api/v1/agent/chats", { chat: { title } }),
  addParticipant: (chat: string, id: string) =>
    call(key, "POST", `/api/v1/agent/chats/${chat}/participants`, { participant: { participant_id: id, role: "member" } }),
  send: (chat: string, content: string, mentionIds: string[]) =>
    call(key, "POST", `/api/v1/agent/chats/${chat}/messages`, { message: { content, mentions: mentionIds.map((id) => ({ id })) } }),
  event: (chat: string, type: "thought" | "tool_call" | "tool_result" | "error" | "task", content: string) =>
    call(key, "POST", `/api/v1/agent/chats/${chat}/events`, { event: { message_type: type, content: content.slice(0, 16000) } }),
  next: async (chat: string) => (await call<{ data: BandMessage }>(key, "GET", `/api/v1/agent/chats/${chat}/messages/next`))?.data ?? null,
  processing: (chat: string, id: string) => call(key, "POST", `/api/v1/agent/chats/${chat}/messages/${id}/processing`),
  processed: (chat: string, id: string) => call(key, "POST", `/api/v1/agent/chats/${chat}/messages/${id}/processed`),
  failed: (chat: string, id: string) => call(key, "POST", `/api/v1/agent/chats/${chat}/messages/${id}/failed`),
});

export const humanApi = (key: string) => ({
  me: () => call<{ data: { user: { id: string; handle: string; first_name?: string } } }>(key, "GET", "/api/v1/me"),
  agents: () => call<{ data: { id: string; name: string }[] }>(key, "GET", "/api/v1/me/agents"),
  register: (name: string, description: string) =>
    call<{ data: { agent: { id: string; name: string }; credentials: { api_key: string } } }>(key, "POST", "/api/v1/me/agents/register", {
      agent: { name, description },
    }),
  send: (chat: string, content: string, mentionIds: string[]) =>
    call(key, "POST", `/api/v1/me/chats/${chat}/messages`, { message: { content, mentions: mentionIds.map((id) => ({ id })) } }),
});
