import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { VOICEBOX_URL, VoiceboxError } from "./client.js";

export interface TranscriptionResult {
  text: string;
  duration: number;
}

export async function transcribe(wavPath: string, language = "en"): Promise<TranscriptionResult> {
  const buf = await readFile(wavPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/wav" }), basename(wavPath));
  form.append("language", language);

  const res = await fetch(`${VOICEBOX_URL}/transcribe`, { method: "POST", body: form });
  if (!res.ok) {
    throw new VoiceboxError(`POST /transcribe → ${res.status}`, res.status, await res.text());
  }
  return (await res.json()) as TranscriptionResult;
}
