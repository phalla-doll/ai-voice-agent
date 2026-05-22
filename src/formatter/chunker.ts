import { cleanMarkdown } from "./markdown.js";

/**
 * Buffer text deltas and emit speakable chunks.
 *
 * Rules:
 *  - flush on sentence end (. ! ?) followed by whitespace/EOL
 *  - flush on blank line (paragraph break)
 *  - drop content inside ``` fenced code blocks
 *  - on flush(): emit whatever remains, cleaned
 */
export class SpeechChunker {
  private buf = "";
  private inCodeFence = false;

  feed(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];

    let chunk: string | null;
    while ((chunk = this.tryExtract()) !== null) {
      const cleaned = cleanMarkdown(chunk);
      if (cleaned) out.push(cleaned);
    }
    return out;
  }

  /** Flush remaining buffered text (call at end of stream). */
  flush(): string | null {
    // close any open fence by dropping its content
    if (this.inCodeFence) {
      this.buf = "";
      this.inCodeFence = false;
      return null;
    }
    const remaining = this.buf.trim();
    this.buf = "";
    if (!remaining) return null;
    const cleaned = cleanMarkdown(remaining);
    return cleaned || null;
  }

  /**
   * Scan buf for the next chunk boundary; return the chunk text (without the
   * boundary punctuation handling) and trim buf. Returns null if no full
   * chunk is available yet.
   */
  private tryExtract(): string | null {
    // Handle code fence transitions first
    const fenceIdx = this.buf.indexOf("```");
    if (this.inCodeFence) {
      if (fenceIdx < 0) {
        // still inside an unclosed fence; drop everything we have
        this.buf = "";
        return null;
      }
      // drop everything up to and including the closing fence
      this.buf = this.buf.slice(fenceIdx + 3);
      this.inCodeFence = false;
      // continue scanning the remainder
    } else if (fenceIdx >= 0) {
      // grab any speakable text before the fence, then enter fence mode
      const before = this.buf.slice(0, fenceIdx);
      this.buf = this.buf.slice(fenceIdx + 3);
      this.inCodeFence = true;
      const trimmed = before.trim();
      if (trimmed) return trimmed;
      return this.tryExtract(); // nothing before fence, try again in fence mode
    }

    // Look for sentence boundary: [.!?] followed by space, newline, or end
    const m = this.buf.match(/[^.!?\n]*[.!?](?=\s|$)|[^\n]*\n\s*\n/);
    if (!m) return null;
    const end = m.index! + m[0].length;
    const chunk = this.buf.slice(0, end).trim();
    this.buf = this.buf.slice(end).replace(/^\s+/, "");
    return chunk || this.tryExtract();
  }
}
