// Standalone sanity checks for the chunker. Run with: npx tsx src/formatter/chunker.test.ts
import { SpeechChunker } from "./chunker.js";

function assertEq<T>(name: string, got: T, want: T) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    console.error(`✗ ${name}\n   got:  ${a}\n   want: ${b}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${name}`);
  }
}

function runAll(chunker: SpeechChunker, deltas: string[]): string[] {
  const out: string[] = [];
  for (const d of deltas) out.push(...chunker.feed(d));
  const tail = chunker.flush();
  if (tail) out.push(tail);
  return out;
}

// 1. Sentence boundaries split correctly
{
  const c = new SpeechChunker();
  assertEq("two sentences", runAll(c, ["Hello world. ", "How are you?"]),
    ["Hello world.", "How are you?"]);
}

// 2. Streaming deltas mid-sentence buffer
{
  const c = new SpeechChunker();
  assertEq("mid-sentence buffering",
    runAll(c, ["He", "llo wo", "rld. Goodbye."]),
    ["Hello world.", "Goodbye."]);
}

// 3. Code fences are dropped
{
  const c = new SpeechChunker();
  assertEq("strip code fence",
    runAll(c, ["Here is code: ```\nconst x = 1;\n```\nAll done."]),
    ["Here is code:", "All done."]);
}

// 4. Markdown is cleaned
{
  const c = new SpeechChunker();
  assertEq("strip markdown",
    runAll(c, ["**Hello** _world_. See [docs](http://x) for `code`."]),
    ["Hello world.", "See docs for code."]);
}

// 5. Heading hash stripped
{
  const c = new SpeechChunker();
  assertEq("strip heading",
    runAll(c, ["## Installation\n\nRun npm install. "]),
    ["Installation", "Run npm install."]);
}

// 6. Empty input yields nothing
{
  const c = new SpeechChunker();
  assertEq("empty", runAll(c, [""]), []);
}

if (process.exitCode) {
  console.error("\nFAIL");
} else {
  console.log("\nOK");
}
