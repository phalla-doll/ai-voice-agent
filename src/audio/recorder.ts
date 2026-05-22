import { spawn } from "node:child_process";

export interface RecordOptions {
  outPath: string;
  /** Sample rate, default 16000 (Whisper-friendly). */
  sampleRate?: number;
  /** Channels, default 1. */
  channels?: number;
  /** Auto-stop after this much trailing silence. Default: disabled. */
  autoStopSilenceMs?: number;
  /** Amplitude threshold below which counts as silence, as a percentage string (e.g. "1%"). Default "1.5%". */
  silenceThreshold?: string;
}

/**
 * Records from the default mic to a 16-bit PCM WAV file using `sox`.
 * Returns a controller — call `stop()` to end recording and resolve `done`.
 */
export function startRecording(opts: RecordOptions) {
  const sampleRate = opts.sampleRate ?? 16000;
  const channels = opts.channels ?? 1;

  // sox -d -> default input device
  //   -r 16000 -c 1 -b 16 -e signed-integer -t wav <outPath>
  const args = [
    "-d",
    "-r", String(sampleRate),
    "-c", String(channels),
    "-b", "16",
    "-e", "signed-integer",
    "-t", "wav",
    opts.outPath,
  ];

  // Optional: stop sox automatically after trailing silence.
  // silence above-periods duration threshold stop-periods stop-duration stop-threshold
  //   above 1 0.1 <thresh>  → start passing audio as soon as ~0.1s of speech is seen
  //   stop  1 <ms> <thresh> → stop after that long of silence
  if (opts.autoStopSilenceMs && opts.autoStopSilenceMs > 0) {
    const thresh = opts.silenceThreshold ?? "1.5%";
    const silenceSec = (opts.autoStopSilenceMs / 1000).toFixed(2);
    args.push("silence", "1", "0.1", thresh, "1", silenceSec, thresh);
  }

  const child = spawn("sox", args, { stdio: ["ignore", "ignore", "pipe"] });

  const done = new Promise<void>((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      // SIGINT/SIGTERM is the expected stop path → success
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") {
        resolve();
      } else {
        reject(new Error(`sox exited with code ${code}: ${stderr}`));
      }
    });
  });

  return {
    stop() {
      if (!child.killed) child.kill("SIGTERM");
    },
    done,
  };
}

/** Record for a fixed duration in seconds, then return. */
export async function recordFor(seconds: number, outPath: string): Promise<void> {
  const rec = startRecording({ outPath });
  setTimeout(() => rec.stop(), seconds * 1000);
  await rec.done;
}
