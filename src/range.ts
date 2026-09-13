/** One inclusive byte range. */
export interface ByteRange {
  start: number
  end: number
}

/** Result distinguishing an absent Range from a malformed or unsatisfiable one. */
export type ParsedRange = ByteRange | null | { unsatisfiable: true }

/**
 * Parse one RFC 7233 byte range. Multipart ranges are rejected because this
 * route deliberately serves a single stream.
 * @param raw - Range header.
 * @param size - Current file size.
 * @returns inclusive bounds, null when absent, or an unsatisfiable marker.
 */
export function parseRange(raw: string | undefined, size: number): ParsedRange {
  if (raw === undefined) return null
  const match = /^bytes=(\d*)-(\d*)$/iu.exec(raw.trim())
  if (match === null || (match[1] === '' && match[2] === '')) return { unsatisfiable: true }
  const startText = match[1] ?? ''
  const endText = match[2] ?? ''
  if (startText === '') {
    const suffix = Number(endText)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { unsatisfiable: true }
    return suffix >= size ? { start: 0, end: size - 1 } : { start: size - suffix, end: size - 1 }
  }
  const start = Number(startText)
  const end = endText === '' ? size - 1 : Number(endText)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return { unsatisfiable: true }
  }
  return { start, end: Math.min(end, size - 1) }
}

/**
 * Decide whether If-Range permits the requested partial response.
 * @param value - If-Range header.
 * @param etag - Strong entity tag for the opened file.
 * @param mtimeMs - Opened file modification time.
 * @returns true when the range may be served.
 */
export function ifRangeMatches(value: string | undefined, etag: string, mtimeMs: number): boolean {
  if (value === undefined) return true
  const candidate = value.trim()
  if (candidate.startsWith('"')) return candidate === etag
  const timestamp = Date.parse(candidate)
  return Number.isFinite(timestamp) && Math.trunc(mtimeMs / 1000) * 1000 <= timestamp
}
