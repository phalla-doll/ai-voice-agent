import { vbxBytes, vbxJson } from "./client.js";

interface SpeakResponse {
  id: string;
  status: string;
  error: string | null;
}

interface HistoryRecord {
  id: string;
  status: "generating" | "completed" | "failed" | string;
  error: string | null;
  duration: number | null;
}

export interface SpeakOptions {
  profile?: string;
  language?: string;
  engine?: string;
  /** Polling interval in ms. Default 100. */
  pollIntervalMs?: number;
  /** Max time to wait for completion in ms. Default 30_000. */
  timeoutMs?: number;
}

/** Submit text, wait until generation completes, return WAV bytes. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<Buffer> {
  const profile = opts.profile ?? "Heart";
  const submitted = await vbxJson<SpeakResponse>("/speak", {
    method: "POST",
    body: { text, profile, language: opts.language, engine: opts.engine },
  });

  const interval = opts.pollIntervalMs ?? 100;
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);

  while (Date.now() < deadline) {
    const rec = await vbxJson<HistoryRecord>(`/history/${submitted.id}`);
    if (rec.status === "completed") {
      return vbxBytes(`/audio/${submitted.id}`);
    }
    if (rec.status === "failed") {
      throw new Error(`TTS failed: ${rec.error ?? "unknown error"}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`TTS timed out waiting for generation ${submitted.id}`);
}
