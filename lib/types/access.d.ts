/** Request authorization shared by the video route. */
import type { IncomingMessage } from 'node:http';
import type { HostConnectionHandle, ConnectionRequestRejection } from '@deepseek-ai/dsh-client-connection';
/** Host services required to authorize a video request. */
export interface VideoAccessContext {
    connection: HostConnectionHandle;
    get(name: string, strict?: boolean): unknown;
}
/**
 * Apply Desktop private-carrier identity or the official Connection checks.
 * @param ctx - Host services supplying both decisions.
 * @param request - Original request object; it is never reconstructed before authorization.
 * @returns 401 or 403 when rejected, otherwise undefined.
 */
export declare function videoRequestRejection(ctx: VideoAccessContext, request: IncomingMessage): ConnectionRequestRejection;
//# sourceMappingURL=access.d.ts.map