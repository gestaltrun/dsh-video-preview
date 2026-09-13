/** Authorized, workspace-scoped HTTP Range streaming for the video viewer. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { openWorkspaceVideo, VideoRouteError, type OpenVideo, type VideoFileIo, DEFAULT_VIDEO_FILE_IO } from './file.ts'
import { ifRangeMatches, parseRange, type ByteRange } from './range.ts'
import { videoRequestRejection } from './access.ts'

export const name = 'dsh-video-preview'
export const inject = ['webServer', 'sessions', 'connection']
export const VIDEO_ROUTE = '/sidebar/video'

interface VideoContextShape {
  webServer: Pick<WebServer, 'register'>
  connection: HostConnectionHandle
  sessions: { get(id: string): { header: { cwd?: string } } | undefined }
}

type VideoContext = CordisContext & VideoContextShape

/** Dependencies replaceable only by focused filesystem tests. */
export interface VideoRouteInternals {
  fileIo?: VideoFileIo
}

function firstHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function writeError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined)
    return
  }
  const status = error instanceof VideoRouteError ? error.status : 500
  const code = error instanceof VideoRouteError ? error.code : 'internal'
  const message = error instanceof Error ? error.message : String(error)
  const body = Buffer.from(JSON.stringify({ ok: false, error: { code, message } }))
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(body.byteLength) })
  response.end(body)
}

function etagOf(file: OpenVideo): string {
  return `"${file.size.toString(16)}-${Math.trunc(file.mtimeMs).toString(16)}"`
}

function responseHeaders(file: OpenVideo): Record<string, string> {
  return {
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-cache',
    'content-type': file.type,
    etag: etagOf(file),
    'last-modified': new Date(file.mtimeMs).toUTCString(),
    'x-content-type-options': 'nosniff',
  }
}

async function closeQuietly(file: OpenVideo): Promise<void> {
  try { await file.handle.close() } catch { /* The stream may already own the closed handle. */ }
}

function stream(request: IncomingMessage, response: ServerResponse, file: OpenVideo, range: ByteRange | null): void {
  const headers = responseHeaders(file)
  if (range === null) {
    response.writeHead(200, { ...headers, 'content-length': String(file.size) })
  } else {
    response.writeHead(206, {
      ...headers,
      'content-range': `bytes ${range.start}-${range.end}/${file.size}`,
      'content-length': String(range.end - range.start + 1),
    })
  }
  if (request.method === 'HEAD') {
    response.end()
    void closeQuietly(file)
    return
  }
  const body = file.handle.createReadStream(range === null ? {} : { start: range.start, end: range.end })
  const cancel = (): void => { if (!response.writableEnded) body.destroy(new Error('video request cancelled')) }
  request.once('aborted', cancel)
  response.once('close', cancel)
  body.once('close', () => {
    request.off('aborted', cancel)
    response.off('close', cancel)
  })
  body.once('error', (error) => {
    if (response.headersSent) response.destroy(error)
    else writeError(response, error)
  })
  body.pipe(response)
}

/** Build the route handler around current Host services. */
export function createVideoHandler(ctx: VideoContext, internals: VideoRouteInternals = {}) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const rejection = videoRequestRejection(ctx, request)
    if (rejection !== undefined) {
      request.resume()
      response.writeHead(rejection)
      response.end(rejection === 401 ? 'unauthorized' : 'forbidden')
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      request.resume()
      response.writeHead(405, { allow: 'GET, HEAD' })
      response.end()
      return
    }
    let file: OpenVideo | undefined
    try {
      const url = new URL(request.url ?? '/', 'http://dsh.internal')
      const sessionId = url.searchParams.get('sessionId')
      const target = url.searchParams.get('path')
      if (sessionId === null || target === null) throw new VideoRouteError(400, 'bad-request', 'sessionId and path are required')
      const workspace = ctx.sessions.get(sessionId)?.header.cwd
      if (workspace === undefined || workspace === '') throw new VideoRouteError(404, 'unknown-session', 'session workspace is unavailable')
      file = await openWorkspaceVideo(workspace, target, internals.fileIo ?? DEFAULT_VIDEO_FILE_IO)
      const etag = etagOf(file)
      const rawRange = firstHeader(request, 'range')
      const parsed = ifRangeMatches(firstHeader(request, 'if-range'), etag, file.mtimeMs) ? parseRange(rawRange, file.size) : null
      if (parsed !== null && 'unsatisfiable' in parsed) {
        response.writeHead(416, { ...responseHeaders(file), 'content-range': `bytes */${file.size}` })
        response.end()
        await closeQuietly(file)
        return
      }
      stream(request, response, file, parsed)
      file = undefined
    } catch (error) {
      if (file !== undefined) await closeQuietly(file)
      writeError(response, error)
    }
  }
}

/** Register the host route through the shared WebServer service. */
export function apply(ctx: VideoContext): void {
  const handler = createVideoHandler(ctx)
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: VIDEO_ROUTE, handler }), 'dsh-video-preview: authorized range route')
}
