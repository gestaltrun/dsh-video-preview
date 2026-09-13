import type { IncomingMessage } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { videoRequestRejection, type VideoAccessContext } from '../src/access.ts'

describe('videoRequestRejection', () => {
  it('accepts only the exact request owned by the Desktop private HTTP seam', () => {
    const owned = {} as IncomingMessage
    const forged = {} as IncomingMessage
    const requests = new WeakSet<object>([owned])
    const official = vi.fn(() => 403 as const)
    const ctx = {
      connection: { requestRejection: official },
      get: () => ({ isTrusted: (request: IncomingMessage) => requests.has(request) }),
    } as unknown as VideoAccessContext
    expect(videoRequestRejection(ctx, owned)).toBeUndefined()
    expect(videoRequestRejection(ctx, forged)).toBe(403)
    expect(official).toHaveBeenCalledOnce()
  })

  it('preserves the official Connection rejection when no private seam exists', () => {
    const ctx = {
      connection: { requestRejection: () => 401 as const },
      get: () => undefined,
    } as unknown as VideoAccessContext
    expect(videoRequestRejection(ctx, {} as IncomingMessage)).toBe(401)
  })
})
