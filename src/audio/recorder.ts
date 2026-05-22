import { spawn } from "node:child_process";

export interface RecordOptions {
  outPath: string;
  /** Sample rate, default 16000 (Whisper-friendly). */
  sampleRate?: number;
  /** Channels, default 1. */
  channels?: number;
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
