import {createHash} from "node:crypto";

export type ProposalRange = Readonly<{offset: number; length: number}>;

export type ProposalRangeIndex = Readonly<{
  ranges: ReadonlyMap<string, ProposalRange>;
  observedBytes: number;
  sha256: string;
}>;

const proposalIdPattern = /^(?:regional-r\d+c\d+|highres-hr_r\d+c\d+)$/;

export async function indexProposalDetailChunks(
  chunks: AsyncIterable<Buffer | string>,
): Promise<ProposalRangeIndex> {
  const hash = createHash("sha256");
  const ranges = new Map<string, ProposalRange>();
  let observedBytes = 0;
  let current: Readonly<{id: string; offset: number}> | null = null;
  const marker = Buffer.from("\n  \"");
  const closingMarker = Buffer.from("\n}");
  const retainedTailBytes = 512;
  let tail = Buffer.alloc(0);
  let lastMarkerOffset = -1;

  for await (const rawChunk of chunks) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    hash.update(chunk);
    const baseOffset = observedBytes - tail.byteLength;
    observedBytes += chunk.byteLength;
    const combined = tail.byteLength === 0 ? chunk : Buffer.concat([tail, chunk]);
    let searchOffset = 0;
    while (searchOffset < combined.byteLength) {
      const markerOffset = combined.indexOf(marker, searchOffset);
      if (markerOffset < 0) break;
      const globalMarkerOffset = baseOffset + markerOffset;
      const lineEnd = combined.indexOf(0x0a, markerOffset + 1);
      if (lineEnd < 0) break;
      if (globalMarkerOffset > lastMarkerOffset) {
        const line = combined.subarray(markerOffset + 1, lineEnd).toString("utf8");
        const match = /^ {2}"([^"]+)": \{$/.exec(line);
        if (!match || !proposalIdPattern.test(match[1])) {
          throw new Error("proposal detail file contains an invalid top-level entry header");
        }
        if (ranges.has(match[1])) {
          throw new Error("proposal detail file contains a duplicate top-level entry");
        }
        if (current) {
          if (current.id === match[1]) {
            throw new Error("proposal detail file contains a duplicate top-level entry");
          }
          ranges.set(current.id, rangeBetween(current.offset, globalMarkerOffset - 1));
        }
        const openingBrace = line.indexOf("{");
        current = {
          id: match[1],
          offset: globalMarkerOffset + 1 + Buffer.byteLength(line.slice(0, openingBrace)),
        };
        lastMarkerOffset = globalMarkerOffset;
      }
      searchOffset = markerOffset + marker.byteLength;
    }
    tail = Buffer.from(combined.subarray(Math.max(0, combined.byteLength - retainedTailBytes)));
  }

  const closingOffsetInTail = tail.lastIndexOf(closingMarker);
  if (!current || closingOffsetInTail < 0) {
    throw new Error("proposal detail index ended before the top-level object closed");
  }
  const closingOffset = observedBytes - tail.byteLength + closingOffsetInTail;
  ranges.set(current.id, rangeBetween(current.offset, closingOffset));
  return {ranges, observedBytes, sha256: hash.digest("hex")};
}

function rangeBetween(start: number, endExclusive: number): ProposalRange {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endExclusive) || endExclusive <= start) {
    throw new Error("invalid proposal detail byte range");
  }
  return {offset: start, length: endExclusive - start};
}
