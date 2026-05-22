import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { transcribe } from "./voicebox/stt.js";
import { speak } from "./voicebox/tts.js";
import { VOICEBOX_URL } from "./voicebox/client.js";
import { recordFor } from "./audio/recorder.js";
import { playBuffer, playFile } from "./audio/playback.js";
import { ask } from "./opencode/ask.js";
import { runRepl } from "./cli/repl.js";

async function loop() {
  console.log("→ recording 5s, speak now…");
  const wavPath = "tmp/in.wav";
  const t0 = Date.now();
  await recordFor(5, wavPath);
  console.log(`  recorded (${Date.now() - t0}ms) → ${wavPath}`);

  const t1 = Date.now();
  const { text } = await transcribe(wavPath);
  console.log(`  transcribed (${Date.now() - t1}ms): "${text}"`);

  if (!text.trim()) {
    console.log("  (empty transcription, nothing to say)");
    return;
  }

  const t1b = Date.now();
  const { text: reply, tokens, cost } = await ask(text, { continueSession: true });
  console.log(`  opencode (${Date.now() - t1b}ms${tokens ? `, ${tokens.total} tok` : ""}${cost ? `, $${cost.toFixed(4)}` : ""}): ${reply}`);
  if (!reply.trim()) {
    console.log("  (empty opencode reply, nothing to say)");
    return;
  }

  const t2 = Date.now();
  const wav = await speak(reply);
  console.log(`  tts (${Date.now() - t2}ms, ${wav.length}B)`);

  const t3 = Date.now();
  await playBuffer(wav);
  console.log(`  played (${Date.now() - t3}ms)`);
  console.log(`✓ total ${Date.now() - t0}ms`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd) {
    console.log("voice agent ready");
    console.log(`voicebox: ${VOICEBOX_URL}`);
    console.log("commands:");
    console.log("  npm run dev -- chat                  → interactive REPL: SPACE = talk, Q = quit");
    console.log("  npm run dev -- loop                  → one-shot record→stt→opencode→tts→play");
    console.log("  npm run dev -- ask <text>            → send text to opencode, print reply");
    console.log("  npm run dev -- record <sec> <out>    → record to wav");
    console.log("  npm run dev -- play <wav>            → play a wav");
    console.log("  npm run dev -- speak <text>          → tmp/out.wav");
    console.log("  npm run dev -- transcribe <wavPath>  → prints text");
    return;
  }

  if (cmd === "chat") {
    await runRepl();
    return;
  }

  if (cmd === "loop") {
    await loop();
    return;
  }

  if (cmd === "ask") {
    const text = args.join(" ");
    if (!text) throw new Error("usage: ask <text>");
    const t0 = Date.now();
    const r = await ask(text);
    console.log(`opencode ok (${Date.now() - t0}ms): ${r.text}`);
    if (r.tokens) console.log(`  tokens: ${JSON.stringify(r.tokens)}  cost: $${r.cost ?? 0}`);
    return;
  }

  if (cmd === "record") {
    const sec = Number(args[0] ?? 3);
    const out = args[1] ?? "tmp/recorded.wav";
    console.log(`recording ${sec}s → ${out}`);
    await recordFor(sec, out);
    console.log("done");
    return;
  }

  if (cmd === "play") {
    const path = args[0];
    if (!path) throw new Error("usage: play <wavPath>");
    await playFile(path).done;
    return;
  }

  if (cmd === "speak") {
    const text = args.join(" ") || "hello from the voice agent";
    const t0 = Date.now();
    const wav = await speak(text);
    await writeFile("tmp/out.wav", wav);
    console.log(`speak ok (${wav.length} bytes, ${Date.now() - t0}ms) → tmp/out.wav`);
    return;
  }

  if (cmd === "transcribe") {
    const path = args[0];
    if (!path) throw new Error("usage: transcribe <wavPath>");
    const t0 = Date.now();
    const out = await transcribe(path);
    console.log(`transcribe ok (${Date.now() - t0}ms): "${out.text}"`);
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
