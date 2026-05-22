import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

interface OpenCodeEvent {
  type: string;
  part?: {
    type?: string;
    text?: string;
    reason?: string;
    tokens?: { input: number; output: number; total: number };
    cost?: number;
  };
}

export interface OpenCodeReply {
  text: string;
  tokens?: { input: number; output: number; total: number };
  cost?: number;
}

export interface AskOptions {
  /** Continue last session (-c). Default false. */
  continueSession?: boolean;
  /** provider/model override. */
  model?: string;
  /** Skip external plugins. */
  pure?: boolean;
  /** Working directory for OpenCode. Defaults to current. */
  cwd?: string;
}

/**
 * One-shot prompt to OpenCode. Spawns `opencode run --format json` and
 * collects all `text` parts into a single reply.
 */
export async function ask(prompt: string, opts: AskOptions = {}): Promise<OpenCodeReply> {
  const args = ["run", "--format", "json"];
  if (opts.continueSession) args.push("-c");
  if (opts.model) args.push("-m", opts.model);
  if (opts.pure) args.push("--pure");
  args.push(prompt);

  const child = spawn("opencode", args, {
    cwd: opts.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const chunks: string[] = [];
  let tokens: OpenCodeReply["tokens"];
  let cost: number | undefined;

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let evt: OpenCodeEvent;
    try {
      evt = JSON.parse(line);
    } catch {
      return; // ignore non-JSON noise
    }
    if (evt.type === "text" && evt.part?.text) {
      chunks.push(evt.part.text);
    } else if (evt.type === "step_finish") {
      tokens = evt.part?.tokens;
      cost = evt.part?.cost;
    }
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`opencode exited ${code}: ${stderr.slice(-500)}`));
    });
  });

  return { text: chunks.join("").trim(), tokens, cost };
}
