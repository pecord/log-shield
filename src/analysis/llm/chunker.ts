export interface Chunk {
  id: number;
  startLine: number;
  endLine: number;
  content: string;
}

export function chunkLogFile(
  lines: string[],
  maxCharsPerChunk: number = 12000,
  overlapLines: number = 5
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkId = 0;
  let currentStart = 0;

  while (currentStart < lines.length) {
    let currentChars = 0;
    let currentEnd = currentStart;

    while (currentEnd < lines.length) {
      const lineLen = lines[currentEnd].length + 1; // +1 for newline
      if (currentChars + lineLen > maxCharsPerChunk && currentEnd > currentStart) {
        break;
      }
      currentChars += lineLen;
      currentEnd++;
    }

    const chunkLines = lines.slice(currentStart, currentEnd);
    chunks.push({
      id: chunkId++,
      startLine: currentStart + 1, // 1-indexed
      endLine: currentEnd,
      content: chunkLines
        .map((line, i) => `${currentStart + i + 1}: ${line}`)
        .join("\n"),
    });

    // Move to next chunk with overlap
    currentStart = Math.max(currentStart + 1, currentEnd - overlapLines);
  }

  return chunks;
}
