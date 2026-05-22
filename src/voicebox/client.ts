import { request } from "undici";

export const VOICEBOX_URL = process.env.VOICEBOX_URL ?? "http://127.0.0.1:17493";

export class VoiceboxError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
    this.name = "VoiceboxError";
  }
}

export async function vbxJson<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const url = `${VOICEBOX_URL}${path}`;
  const res = await request(url, {
    method: init.method ?? "GET",
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new VoiceboxError(`${init.method ?? "GET"} ${path} → ${res.statusCode}`, res.statusCode, text);
  }
  return JSON.parse(text) as T;
}

export async function vbxBytes(path: string): Promise<Buffer> {
  const url = `${VOICEBOX_URL}${path}`;
  const res = await request(url);
  if (res.statusCode >= 400) {
    throw new VoiceboxError(`GET ${path} → ${res.statusCode}`, res.statusCode);
  }
  return Buffer.from(await res.body.arrayBuffer());
}
