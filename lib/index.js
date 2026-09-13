import { open, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
//#region src/file.ts
/** Video MIME types and the only extensions the streaming route accepts. */
const VIDEO_TYPES = Object.freeze({
	".mp4": "video/mp4",
	".m4v": "video/mp4",
	".webm": "video/webm",
	".ogv": "video/ogg",
	".ogg": "video/ogg",
	".mov": "video/quicktime",
	".qt": "video/quicktime",
	".mkv": "video/x-matroska",
	".avi": "video/x-msvideo",
	".wmv": "video/x-ms-wmv",
	".flv": "video/x-flv",
	".m2ts": "video/mp2t",
	".mpeg": "video/mpeg",
	".mpg": "video/mpeg",
	".3gp": "video/3gpp",
	".3g2": "video/3gpp2"
});
const DEFAULT_VIDEO_FILE_IO = {
	realpath,
	open: (path) => open(path, "r")
};
/** Error carrying the intended HTTP status. */
var VideoRouteError = class extends Error {
	status;
	code;
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
};
function within(root, target) {
	const path = relative(root, target);
	return path === "" || !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}
/**
* Canonicalize the workspace and target, enforce containment, and open the
* authorized file for a stable stat/stream pair.
*/
async function openWorkspaceVideo(workspace, target, io = DEFAULT_VIDEO_FILE_IO) {
	if (!isAbsolute(workspace) || !isAbsolute(target)) throw new VideoRouteError(400, "bad-request", "workspace and video path must be absolute");
	let root;
	let canonical;
	try {
		[root, canonical] = await Promise.all([io.realpath(resolve(workspace)), io.realpath(resolve(target))]);
	} catch (error) {
		throw new VideoRouteError(404, "not-found", error instanceof Error ? error.message : String(error));
	}
	if (!within(root, canonical)) throw new VideoRouteError(403, "outside-workspace", "video path is outside the session workspace");
	const type = VIDEO_TYPES[extname(canonical).toLowerCase()];
	if (type === void 0) throw new VideoRouteError(415, "unsupported-media-type", "path is not a supported video file");
	let handle;
	try {
		handle = await io.open(canonical);
	} catch (error) {
		throw new VideoRouteError(404, "not-found", error instanceof Error ? error.message : String(error));
	}
	try {
		const info = await handle.stat();
		if (!info.isFile()) throw new VideoRouteError(400, "not-file", "video path is not a file");
		if (info.size === 0) throw new VideoRouteError(400, "empty-file", "video file is empty");
		return {
			handle,
			path: canonical,
			size: info.size,
			mtimeMs: info.mtimeMs,
			type
		};
	} catch (error) {
		await handle.close();
		throw error;
	}
}
//#endregion
//#region src/range.ts
/**
* Parse one RFC 7233 byte range. Multipart ranges are rejected because this
* route deliberately serves a single stream.
* @param raw - Range header.
* @param size - Current file size.
* @returns inclusive bounds, null when absent, or an unsatisfiable marker.
*/
function parseRange(raw, size) {
	if (raw === void 0) return null;
	const match = /^bytes=(\d*)-(\d*)$/iu.exec(raw.trim());
	if (match === null || match[1] === "" && match[2] === "") return { unsatisfiable: true };
	const startText = match[1] ?? "";
	const endText = match[2] ?? "";
	if (startText === "") {
		const suffix = Number(endText);
		if (!Number.isSafeInteger(suffix) || suffix <= 0) return { unsatisfiable: true };
		return suffix >= size ? {
			start: 0,
			end: size - 1
		} : {
			start: size - suffix,
			end: size - 1
		};
	}
	const start = Number(startText);
	const end = endText === "" ? size - 1 : Number(endText);
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return { unsatisfiable: true };
	return {
		start,
		end: Math.min(end, size - 1)
	};
}
/**
* Decide whether If-Range permits the requested partial response.
* @param value - If-Range header.
* @param etag - Strong entity tag for the opened file.
* @param mtimeMs - Opened file modification time.
* @returns true when the range may be served.
*/
function ifRangeMatches(value, etag, mtimeMs) {
	if (value === void 0) return true;
	const candidate = value.trim();
	if (candidate.startsWith("\"")) return candidate === etag;
	const timestamp = Date.parse(candidate);
	return Number.isFinite(timestamp) && Math.trunc(mtimeMs / 1e3) * 1e3 <= timestamp;
}
//#endregion
//#region src/access.ts
function privateHttpOf(ctx) {
	const value = ctx.get("desktopPrivateHttp", false);
	if (value === void 0 || value === null || typeof value.isTrusted !== "function") return void 0;
	return value;
}
/**
* Apply Desktop private-carrier identity or the official Connection checks.
* @param ctx - Host services supplying both decisions.
* @param request - Original request object; it is never reconstructed before authorization.
* @returns 401 or 403 when rejected, otherwise undefined.
*/
function videoRequestRejection(ctx, request) {
	if (privateHttpOf(ctx)?.isTrusted(request) === true) return void 0;
	return ctx.connection.requestRejection(request);
}
//#endregion
//#region src/index.ts
const name = "dsh-video-preview";
const inject = [
	"webServer",
	"sessions",
	"connection"
];
const VIDEO_ROUTE = "/sidebar/video";
function firstHeader(request, name) {
	const value = request.headers[name];
	return Array.isArray(value) ? value[0] : value;
}
function writeError(response, error) {
	if (response.headersSent) {
		response.destroy(error instanceof Error ? error : void 0);
		return;
	}
	const status = error instanceof VideoRouteError ? error.status : 500;
	const code = error instanceof VideoRouteError ? error.code : "internal";
	const message = error instanceof Error ? error.message : String(error);
	const body = Buffer.from(JSON.stringify({
		ok: false,
		error: {
			code,
			message
		}
	}));
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(body.byteLength)
	});
	response.end(body);
}
function etagOf(file) {
	return `"${file.size.toString(16)}-${Math.trunc(file.mtimeMs).toString(16)}"`;
}
function responseHeaders(file) {
	return {
		"accept-ranges": "bytes",
		"cache-control": "private, no-cache",
		"content-type": file.type,
		etag: etagOf(file),
		"last-modified": new Date(file.mtimeMs).toUTCString(),
		"x-content-type-options": "nosniff"
	};
}
async function closeQuietly(file) {
	try {
		await file.handle.close();
	} catch {}
}
function stream(request, response, file, range) {
	const headers = responseHeaders(file);
	if (range === null) response.writeHead(200, {
		...headers,
		"content-length": String(file.size)
	});
	else response.writeHead(206, {
		...headers,
		"content-range": `bytes ${range.start}-${range.end}/${file.size}`,
		"content-length": String(range.end - range.start + 1)
	});
	if (request.method === "HEAD") {
		response.end();
		closeQuietly(file);
		return;
	}
	const body = file.handle.createReadStream(range === null ? {} : {
		start: range.start,
		end: range.end
	});
	const cancel = () => {
		if (!response.writableEnded) body.destroy(/* @__PURE__ */ new Error("video request cancelled"));
	};
	request.once("aborted", cancel);
	response.once("close", cancel);
	body.once("close", () => {
		request.off("aborted", cancel);
		response.off("close", cancel);
	});
	body.once("error", (error) => {
		if (response.headersSent) response.destroy(error);
		else writeError(response, error);
	});
	body.pipe(response);
}
/** Build the route handler around current Host services. */
function createVideoHandler(ctx, internals = {}) {
	return async (request, response) => {
		const rejection = videoRequestRejection(ctx, request);
		if (rejection !== void 0) {
			request.resume();
			response.writeHead(rejection);
			response.end(rejection === 401 ? "unauthorized" : "forbidden");
			return;
		}
		if (request.method !== "GET" && request.method !== "HEAD") {
			request.resume();
			response.writeHead(405, { allow: "GET, HEAD" });
			response.end();
			return;
		}
		let file;
		try {
			const url = new URL(request.url ?? "/", "http://dsh.internal");
			const sessionId = url.searchParams.get("sessionId");
			const target = url.searchParams.get("path");
			if (sessionId === null || target === null) throw new VideoRouteError(400, "bad-request", "sessionId and path are required");
			const workspace = ctx.sessions.get(sessionId)?.header.cwd;
			if (workspace === void 0 || workspace === "") throw new VideoRouteError(404, "unknown-session", "session workspace is unavailable");
			file = await openWorkspaceVideo(workspace, target, internals.fileIo ?? DEFAULT_VIDEO_FILE_IO);
			const etag = etagOf(file);
			const rawRange = firstHeader(request, "range");
			const parsed = ifRangeMatches(firstHeader(request, "if-range"), etag, file.mtimeMs) ? parseRange(rawRange, file.size) : null;
			if (parsed !== null && "unsatisfiable" in parsed) {
				response.writeHead(416, {
					...responseHeaders(file),
					"content-range": `bytes */${file.size}`
				});
				response.end();
				await closeQuietly(file);
				return;
			}
			stream(request, response, file, parsed);
			file = void 0;
		} catch (error) {
			if (file !== void 0) await closeQuietly(file);
			writeError(response, error);
		}
	};
}
/** Register the host route through the shared WebServer service. */
function apply(ctx) {
	const handler = createVideoHandler(ctx);
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: VIDEO_ROUTE,
		handler
	}), "dsh-video-preview: authorized range route");
}
//#endregion
export { VIDEO_ROUTE, apply, createVideoHandler, inject, name };

//# sourceMappingURL=index.js.map