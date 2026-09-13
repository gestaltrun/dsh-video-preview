/** Request authorization shared by the video route. */
import type { IncomingMessage } from 'node:http'
import type { HostConnectionHandle, ConnectionRequestRejection } from '@deepseek-ai/dsh-client-connection'

/** Desktop Host seam backed by the exact private Duplex objects it owns. */
interface DesktopPrivateHttp {
  isTrusted(request: IncomingMessage): boolean
}

/** Host services required to authorize a video request. */
export interface VideoAccessContext {
  connection: HostConnectionHandle
  get(name: string, strict?: boolean): unknown
}

function privateHttpOf(ctx: VideoAccessContext): DesktopPrivateHttp | undefined {
  const value = ctx.get('desktopPrivateHttp', false)
  if (value === undefined || value === null || typeof (value as DesktopPrivateHttp).isTrusted !== 'function') return undefined
  return value as DesktopPrivateHttp
}

/**
 * Apply Desktop private-carrier identity or the official Connection checks.
 * @param ctx - Host services supplying both decisions.
 * @param request - Original request object; it is never reconstructed before authorization.
 * @returns 401 or 403 when rejected, otherwise undefined.
 */
export function videoRequestRejection(ctx: VideoAccessContext, request: IncomingMessage): ConnectionRequestRejection {
  if (privateHttpOf(ctx)?.isTrusted(request) === true) return undefined
  return ctx.connection.requestRejection(request)
}
