import { speak } from "../voicebox/tts.js";
import { playBuffer } from "../audio/playback.js";

/**
 * FIFO speech pipeline: enqueue text chunks, run TTS in parallel up to
 * concurrency limit, play resulting audio strictly in submit order.
 *
 * Call `enqueue()` as chunks arrive. Call `drain()` to await all playback.
 * Call `cancel()` to stop playback and discard pending audio.
 */
export class SpeechQueue {
  private head = Promise.resolve();
  private cancelled = false;

  enqueue(text: string): void {
    if (this.cancelled) return;
    if (!text.trim()) return;

    // Kick off TTS immediately (parallel across enqueued chunks).
    const ttsPromise = speak(text).catch((err) => {
      console.error("\n  tts failed:", err);
      return null;
    });

    // Chain playback after the previous chunk finishes playing.
    this.head = this.head.then(async () => {
      if (this.cancelled) return;
      const wav = await ttsPromise;
      if (!wav || this.cancelled) return;
      await playBuffer(wav);
    });
  }

  /** Wait for everything currently enqueued to finish playing. */
  async drain(): Promise<void> {
    await this.head;
  }

  /** Stop pipeline; future enqueues are no-ops until you build a new queue. */
  cancel(): void {
    this.cancelled = true;
  }
}
