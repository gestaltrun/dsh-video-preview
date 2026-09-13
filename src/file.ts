/** Workspace-scoped file resolution for video streaming. */
import type { FileHandle } from 'node:fs/promises'
import { open, realpath } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'

/** Video MIME types and the only extensions the streaming route accepts. */
export const VIDEO_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.ogg': 'video/ogg',
  '.mov': 'video/quicktime', '.qt': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv', '.flv': 'video/x-flv', '.m2ts': 'video/mp2t', '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg', '.3gp': 'video/3gpp', '.3g2': 'video/3gpp2',
})

/** Injectable filesystem operations used by the real-path regression tests. */
export interface VideoFileIo {
  realpath(path: string): Promise<string>
  open(path: string): Promise<FileHandle>
}

export const DEFAULT_VIDEO_FILE_IO: VideoFileIo = { realpath, open: path => open(path, 'r') }

/** A file opened after its canonical path was authorized. */
export interface OpenVideo {
  handle: FileHandle
  path: string
  size: number
  mtimeMs: number
  type: string
}

/** Error carrying the intended HTTP status. */
export class VideoRouteError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function within(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
}

/**
 * Canonicalize the workspace and target, enforce containment, and open the
 * authorized file for a stable stat/stream pair.
 */
export async function openWorkspaceVideo(workspace: string, target: string, io: VideoFileIo = DEFAULT_VIDEO_FILE_IO): Promise<OpenVideo> {
  if (!isAbsolute(workspace) || !isAbsolute(target)) throw new VideoRouteError(400, 'bad-request', 'workspace and video path must be absolute')
  let root: string
  let canonical: string
  try {
    ;[root, canonical] = await Promise.all([io.realpath(resolve(workspace)), io.realpath(resolve(target))])
  } catch (error) {
    throw new VideoRouteError(404, 'not-found', error instanceof Error ? error.message : String(error))
  }
  if (!within(root, canonical)) throw new VideoRouteError(403, 'outside-workspace', 'video path is outside the session workspace')
  const type = VIDEO_TYPES[extname(canonical).toLowerCase()]
  if (type === undefined) throw new VideoRouteError(415, 'unsupported-media-type', 'path is not a supported video file')
  let handle: FileHandle
  try {
    handle = await io.open(canonical)
  } catch (error) {
    throw new VideoRouteError(404, 'not-found', error instanceof Error ? error.message : String(error))
  }
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new VideoRouteError(400, 'not-file', 'video path is not a file')
    if (info.size === 0) throw new VideoRouteError(400, 'empty-file', 'video file is empty')
    return { handle, path: canonical, size: info.size, mtimeMs: info.mtimeMs, type }
  } catch (error) {
    await handle.close()
    throw error
  }
}
