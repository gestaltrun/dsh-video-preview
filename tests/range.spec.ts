import { describe, expect, it } from 'vitest'
import { ifRangeMatches, parseRange } from '../src/range.ts'

describe('parseRange', () => {
  it('accepts bounded, open-ended, and suffix byte ranges', () => {
    expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
    expect(parseRange('bytes=7-', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
  })

  it('rejects malformed, multipart, reversed, and out-of-file ranges', () => {
    for (const value of ['items=0-1', 'bytes=0-1,3-4', 'bytes=7-2', 'bytes=10-', 'bytes=-0']) {
      expect(parseRange(value, 10), value).toEqual({ unsatisfiable: true })
    }
  })
})

describe('ifRangeMatches', () => {
  it('matches a strong entity tag or a date at least as new as the file', () => {
    expect(ifRangeMatches('"a-b"', '"a-b"', 1_700_000_000_000)).toBe(true)
    expect(ifRangeMatches('"old"', '"a-b"', 1_700_000_000_000)).toBe(false)
    expect(ifRangeMatches(new Date(1_700_000_001_000).toUTCString(), '"a-b"', 1_700_000_000_000)).toBe(true)
  })
})
