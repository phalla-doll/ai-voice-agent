import { unlink } from "node:fs/promises";
import { startRecording } from "../audio/recorder.js";
import { transcribe } from "../voicebox/stt.js";
import { streamAsk } from "../opencode/stream.js";
import { SpeechChunker } from "../formatter/chunker.js";
import { SpeechQueue } from "../queue/speechQueue.js";

interface Recorder {
  stop: () => void;
  done: Promise<void>;
}

type State = "idle" | "recording" | "thinking";

const WAV_PATH = "tmp/repl.wav";

function printBanner() {
  console.log("\nvoice agent REPL");
  console.log("  SPACE  start / stop recording");
  console.log("  Q      quit\n");
}

function printStatus(state: State) {
  const label =
    state === "recording" ? "● REC (press SPACE to stop)" :
    state === "thinking"  ? "… thinking" :
                            "▷ press SPACE to talk";
  // \r overwrites the current line
  process.stdout.write(`\r${label}\x1b[K`);
}

async function runTurn() {
  const t0 = Date.now();
  const { text } = await transcribe(WAV_PATH);
  if (!text.trim()) {
    console.log("\n  (empty transcription)\n");
    return;
  }
  console.log(`\n  you: ${text}  [stt ${Date.now() - t0}ms]`);

  const t1 = Date.now();
  const { deltas, done } = streamAsk(text, { continueSession: true });
  const chunker = new SpeechChunker();
  const queue = new SpeechQueue();

  let fullReply = "";
  let firstSpokenAt: number | null = null;
  process.stdout.write("  bot: ");

  for await (const delta of deltas) {
    fullReply += delta;
    process.stdout.write(delta);
    for (const chunk of chunker.feed(delta)) {
      if (firstSpokenAt === null) firstSpokenAt = Date.now();
      queue.enqueue(chunk);
    }
  }
  const tail = chunker.flush();
  if (tail) {
    if (firstSpokenAt === null) firstSpokenAt = Date.now();
    queue.enqueue(tail);
  }
  process.stdout.write("\n");

  const stats = await done;
  const tokInfo = stats.tokens ? ` ${stats.tokens.total}tok` : "";
  const costInfo = stats.cost ? ` $${stats.cost.toFixed(4)}` : "";
  const firstSpoken = firstSpokenAt ? ` first-chunk ${firstSpokenAt - t1}ms` : "";
  console.log(`  [oc ${Date.now() - t1}ms${firstSpoken}${tokInfo}${costInfo}]`);

  await queue.drain();
  console.log(`  (turn total ${Date.now() - t0}ms)\n`);
}

export async function runRepl() {
  printBanner();

  let state: State = "idle";
  let recorder: Recorder | null = null;

  printStatus(state);

  const stdin = process.stdin;
  if (!stdin.isTTY) {
    throw new Error("REPL requires a TTY");
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  const cleanup = () => {
    stdin.setRawMode(false);
    stdin.pause();
  };

  const onKey = async (key: string) => {
    // Ctrl-C
    if (key === "" || key === "q" || key === "Q") {
      console.log("\nbye");
      cleanup();
      process.exit(0);
    }

    if (key !== " ") return;

    if (state === "thinking") return; // ignore SPACE while busy

    if (state === "idle") {
      try { await unlink(WAV_PATH); } catch {}
      recorder = startRecording({ outPath: WAV_PATH });
      state = "recording";
      printStatus(state);
      return;
    }

    if (state === "recording" && recorder) {
      recorder.stop();
      await recorder.done;
      recorder = null;
      state = "thinking";
      printStatus(state);
      try {
        await runTurn();
      } catch (err) {
        console.error("\n  turn failed:", err);
      }
      state = "idle";
      printStatus(state);
    }
  };

  stdin.on("data", (data: string) => {
    // Single keypress in raw mode
    onKey(data).catch((err) => {
      console.error("\n  key handler failed:", err);
    });
  });

  // Keep alive until exit
  await new Promise<void>(() => {});
}
