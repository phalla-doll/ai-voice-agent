/**
 * Clean a chunk of markdown for text-to-speech:
 *  - strip emphasis markers (* _ ` ~)
 *  - strip headings markers (#)
 *  - replace link [label](url) with just "label"
 *  - collapse whitespace
 *
 * Code fences are removed at the chunker level, not here.
 */
export function cleanMarkdown(text: string): string {
  return text
    // links: [label](url) → label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // images: ![alt](src) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // inline code `x` → x
    .replace(/`([^`]+)`/g, "$1")
    // bold/italic markers
    .replace(/\*\*|__|\*|_|~~/g, "")
    // heading hashes at line start
    .replace(/^#{1,6}\s+/gm, "")
    // list bullets at line start
    .replace(/^\s*[-*+]\s+/gm, "")
    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}
