import type { Context, FileViewerDescriptor, FileViewerProps } from '@gestaltrun/dsh-better-sidebar';
type SessionScope = FileViewerProps['scope'];
/** File extensions claimed by the viewer. */
export declare const VIDEO_EXTENSIONS: readonly ["mp4", "m4v", "webm", "ogv", "ogg", "mov", "qt", "mkv", "avi", "wmv", "flv", "m2ts", "mpeg", "mpg", "3gp", "3g2"];
/** Build the authenticated local or paired-remote streaming URL. */
export declare function videoUrl(scope: SessionScope, path: string, href?: string): string;
/** Build the matching Better Sidebar download fallback. */
export declare function downloadUrl(scope: SessionScope, path: string, href?: string): string;
/** Read-only HTML video player with an explicit failure fallback. */
export declare function VideoView({ scope, path, title }: FileViewerProps): import("react").JSX.Element;
/** Descriptor registered with the public Better Sidebar viewer service. */
export declare function videoViewer(): FileViewerDescriptor;
export declare const inject: string[];
/** Register localized copy and the viewer for this client-plugin lifetime. */
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=client.d.ts.map