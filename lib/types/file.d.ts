/** Workspace-scoped file resolution for video streaming. */
import type { FileHandle } from 'node:fs/promises';
/** Video MIME types and the only extensions the streaming route accepts. */
export declare const VIDEO_TYPES: Readonly<Record<string, string>>;
/** Injectable filesystem operations used by the real-path regression tests. */
export interface VideoFileIo {
    realpath(path: string): Promise<string>;
    open(path: string): Promise<FileHandle>;
}
export declare const DEFAULT_VIDEO_FILE_IO: VideoFileIo;
/** A file opened after its canonical path was authorized. */
export interface OpenVideo {
    handle: FileHandle;
    path: string;
    size: number;
    mtimeMs: number;
    type: string;
}
/** Error carrying the intended HTTP status. */
export declare class VideoRouteError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
/**
 * Canonicalize the workspace and target, enforce containment, and open the
 * authorized file for a stable stat/stream pair.
 */
export declare function openWorkspaceVideo(workspace: string, target: string, io?: VideoFileIo): Promise<OpenVideo>;
//# sourceMappingURL=file.d.ts.map