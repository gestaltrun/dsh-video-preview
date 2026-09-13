/** Authorized, workspace-scoped HTTP Range streaming for the video viewer. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context as CordisContext } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { WebServer } from '@deepseek-ai/dsh-host-webserver';
import { type VideoFileIo } from './file.ts';
export declare const name = "dsh-video-preview";
export declare const inject: string[];
export declare const VIDEO_ROUTE = "/sidebar/video";
interface VideoContextShape {
    webServer: Pick<WebServer, 'register'>;
    connection: HostConnectionHandle;
    sessions: {
        get(id: string): {
            header: {
                cwd?: string;
            };
        } | undefined;
    };
}
type VideoContext = CordisContext & VideoContextShape;
/** Dependencies replaceable only by focused filesystem tests. */
export interface VideoRouteInternals {
    fileIo?: VideoFileIo;
}
/** Build the route handler around current Host services. */
export declare function createVideoHandler(ctx: VideoContext, internals?: VideoRouteInternals): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
/** Register the host route through the shared WebServer service. */
export declare function apply(ctx: VideoContext): void;
export {};
//# sourceMappingURL=index.d.ts.map