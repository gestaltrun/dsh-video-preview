/** One inclusive byte range. */
export interface ByteRange {
    start: number;
    end: number;
}
/** Result distinguishing an absent Range from a malformed or unsatisfiable one. */
export type ParsedRange = ByteRange | null | {
    unsatisfiable: true;
};
/**
 * Parse one RFC 7233 byte range. Multipart ranges are rejected because this
 * route deliberately serves a single stream.
 * @param raw - Range header.
 * @param size - Current file size.
 * @returns inclusive bounds, null when absent, or an unsatisfiable marker.
 */
export declare function parseRange(raw: string | undefined, size: number): ParsedRange;
/**
 * Decide whether If-Range permits the requested partial response.
 * @param value - If-Range header.
 * @param etag - Strong entity tag for the opened file.
 * @param mtimeMs - Opened file modification time.
 * @returns true when the range may be served.
 */
export declare function ifRangeMatches(value: string | undefined, etag: string, mtimeMs: number): boolean;
//# sourceMappingURL=range.d.ts.map