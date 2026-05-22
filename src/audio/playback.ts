import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

/** Play a WAV file using macOS `afplay`. Resolves when playback ends. */
export function playFile(path: string) {
  const child = spawn("afplay", [path], { stdio: "ignore" });
  const done = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`afplay exited with code ${code}`));
    });
  });
  return { stop: () => child.kill("SIGTERM"), done };
}

/** Write a WAV buffer to a temp file and play it. */
export async function playBuffer(buf: Buffer, tmpPath = "tmp/playback.wav"): Promise<void> {
  await writeFile(tmpPath, buf);
  await playFile(tmpPath).done;
}
