import { createServer, get as httpGet, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { open, realpath, type FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createVideoHandler } from '../src/index.ts'
import type { VideoFileIo } from '../src/file.ts'

const workspace = mkdtempSync(join(tmpdir(), 'dsh-video-workspace-'))
const outside = mkdtempSync(join(tmpdir(), 'dsh-video-outside-'))
const bytes = Buffer.from(Array.from({ length: 4096 }, (_, index) => (index * 31 + 7) % 256))
const video = join(workspace, 'clip.mp4')
const outsideVideo = join(outside, 'private.mp4')
writeFileSync(video, bytes)
writeFileSync(outsideVideo, bytes)
symlinkSync(outsideVideo, join(workspace, 'escape.mp4'))

let port = 0
let closeServer: (() => Promise<void>) | undefined
const opened: FileHandle[] = []
const fileIo: VideoFileIo = {
  realpath,
  async open(path) {
    const handle = await open(path, 'r')
    opened.push(handle)
    return handle
  },
}

function context() {
  return {
    sessions: { get: (id: string) => id === 'session-1' ? { header: { cwd: workspace } } : undefined },
    connection: {
      requestRejection(request: IncomingMessage) {
        if (request.headers['x-test-local'] === '1') return undefined
        return request.headers.authorization === 'Bearer paired' ? undefined : 403
      },
    },
    get: () => undefined,
  }
}

beforeAll(async () => {
  const handler = createVideoHandler(context() as never, { fileIo })
  const server = createServer((request: IncomingMessage, response: ServerResponse) => { void handler(request, response) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('test server did not bind TCP')
  port = address.port
  closeServer = () => new Promise<void>((resolve, reject) => server.close(error => { if (error) reject(error); else resolve() }))
})

afterAll(async () => {
  await closeServer?.()
  rmSync(workspace, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

function url(path = video, sessionId = 'session-1'): string {
  const params = new URLSearchParams({ sessionId, path })
  return `http://127.0.0.1:${String(port)}/sidebar/video?${params.toString()}`
}

async function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (!headers.has('x-test-local')) headers.set('x-test-local', '1')
  const response = await fetch(path, { ...init, headers })
  return { response, body: Buffer.from(await response.arrayBuffer()) }
}

describe('video route', () => {
  it('serves full content, HEAD, and successful byte ranges', async () => {
    const full = await request(url())
    expect(full.response.status).toBe(200)
    expect(full.response.headers.get('accept-ranges')).toBe('bytes')
    expect(full.body).toEqual(bytes)
    const ranged = await request(url(), { headers: { range: 'bytes=100-199' } })
    expect(ranged.response.status).toBe(206)
    expect(ranged.response.headers.get('content-range')).toBe(`bytes 100-199/${String(bytes.length)}`)
    expect(ranged.body).toEqual(bytes.subarray(100, 200))
    const suffix = await request(url(), { headers: { range: 'bytes=-16' } })
    expect(suffix.body).toEqual(bytes.subarray(bytes.length - 16))
    const head = await request(url(), { method: 'HEAD' })
    expect(head.response.status).toBe(200)
    expect(head.body).toHaveLength(0)
  })

  it('returns 416 for malformed or unsatisfiable ranges and honors If-Range', async () => {
    for (const range of ['bytes=999999-', 'bytes=50-10', 'bytes=0-1,3-4']) {
      const result = await request(url(), { headers: { range } })
      expect(result.response.status, range).toBe(416)
      expect(result.response.headers.get('content-range'), range).toBe(`bytes */${String(bytes.length)}`)
    }
    const changed = await request(url(), { headers: { range: 'bytes=0-9', 'if-range': '"stale"' } })
    expect(changed.response.status).toBe(200)
    expect(changed.body).toEqual(bytes)
  })

  it('rejects unknown sessions, missing files, unsupported files, and realpath escapes', async () => {
    expect((await request(url(video, 'missing'))).response.status).toBe(404)
    expect((await request(url(join(workspace, 'missing.mp4')))).response.status).toBe(404)
    const text = join(workspace, 'notes.txt')
    writeFileSync(text, 'secret')
    expect((await request(url(text))).response.status).toBe(415)
    expect((await request(url(join(workspace, 'escape.mp4')))).response.status).toBe(403)
    expect((await request(url(outsideVideo))).response.status).toBe(403)
  })

  it('preserves official remote authorization decisions', async () => {
    expect((await request(url(), { headers: { 'x-test-local': '0' } })).response.status).toBe(403)
    expect((await request(url(), { headers: { 'x-test-local': '0', authorization: 'Bearer paired' } })).response.status).toBe(200)
  })

  it('closes the opened file when the client cancels a streaming response', async () => {
    const large = join(workspace, 'large.mp4')
    writeFileSync(large, Buffer.alloc(32 * 1024 * 1024, 7))
    const start = opened.length
    await new Promise<void>((resolve, reject) => {
      const request = httpGet(url(large), { headers: { 'x-test-local': '1' } }, response => {
        response.once('data', () => {
          response.destroy()
          resolve()
        })
      })
      request.once('error', error => { if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error) })
    })
    const handle = opened[start]
    expect(handle).toBeDefined()
    await expect.poll(() => handle?.fd).toBe(-1)
  })
})
