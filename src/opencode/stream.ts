import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AskOptions, OpenCodeReply } from "./ask.js";

export interface StreamResult {
  /** Async iterable of text deltas as OpenCode emits them. */
  deltas: AsyncIterable<string>;
  /** Resolves with token counts and cost after the stream ends. */
  done: Promise<Omit<OpenCodeReply, "text">>;
}

interface OpenCodeEvent {
  type: string;
  part?: {
    type?: string;
    text?: string;
    tokens?: { input: number; output: number; total: number };
    cost?: number;
  };
}

/** Spawns `opencode run --format json` and streams text deltas as they arrive. */
export function streamAsk(prompt: string, opts: AskOptions = {}): StreamResult {
  const args = ["run", "--format", "json"];
  if (opts.continueSession) args.push("-c");
  if (opts.model) args.push("-m", opts.model);
  if (opts.pure) args.push("--pure");
  args.push(prompt);

  const child = spawn("opencode", args, {
    cwd: opts.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  // Buffer of pending deltas + resolve/reject hooks for the async iterator
  const queue: string[] = [];
  const waiters: Array<(v: IteratorResult<string>) => void> = [];
  let ended = false;
  let lastSeenText = ""; // dedupe in case OpenCode emits cumulative text

  function pushDelta(text: string) {
    // OpenCode sometimes emits incremental cumulative text; emit only the new suffix
    if (text.startsWith(lastSeenText)) {
      const delta = text.slice(lastSeenText.length);
      lastSeenText = text;
      if (!delta) return;
      text = delta;
    } else {
      lastSeenText = text;
    }
    if (waiters.length) {
      waiters.shift()!({ value: text, done: false });
    } else {
      queue.push(text);
    }
  }

  function endStream() {
    ended = true;
    while (waiters.length) waiters.shift()!({ value: "", done: true });
  }

  let resolveDone!: (v: Omit<OpenCodeReply, "text">) => void;
  let rejectDone!: (err: Error) => void;
  const donePromise = new Promise<Omit<OpenCodeReply, "text">>((res, rej) => {
    resolveDone = res; rejectDone = rej;
  });
  let finalStats: Omit<OpenCodeReply, "text"> = {};

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let evt: OpenCodeEvent;
    try { evt = JSON.parse(line); } catch { return; }
    if (evt.type === "text" && evt.part?.text) {
      pushDelta(evt.part.text);
    } else if (evt.type === "step_finish") {
      finalStats = { tokens: evt.part?.tokens, cost: evt.part?.cost };
      // reset cumulative tracker between steps (multi-step tool runs)
      lastSeenText = "";
    }
  });

  child.on("close", (code) => {
    endStream();
    if (code === 0) resolveDone(finalStats);
    else rejectDone(new Error(`opencode exited ${code}: ${stderr.slice(-500)}`));
  });
  child.on("error", (err) => {
    endStream();
    rejectDone(err);
  });

  const deltas: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<string>> {
          if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
          if (ended) return Promise.resolve({ value: "", done: true });
          return new Promise((res) => waiters.push(res));
        },
      };
    },
  };

  return { deltas, done: donePromise };
}
