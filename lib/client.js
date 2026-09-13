window.__ModuleLoader__.load({
	id: "@gestaltrun/dsh-video-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client.tsx
		/** Better Sidebar video viewer registration. */
		const NS = "dsh-video-preview";
		const zh = {
			viewer: "视频",
			download: "下载",
			unsupported: "浏览器无法播放此视频格式。"
		};
		const en = {
			viewer: "Video",
			download: "Download",
			unsupported: "This browser cannot play the video format."
		};
		let activeLocale = "en";
		/** File extensions claimed by the viewer. */
		const VIDEO_EXTENSIONS = [
			"mp4",
			"m4v",
			"webm",
			"ogv",
			"ogg",
			"mov",
			"qt",
			"mkv",
			"avi",
			"wmv",
			"flv",
			"m2ts",
			"mpeg",
			"mpg",
			"3gp",
			"3g2"
		];
		function t(key) {
			return activeLocale.toLowerCase().startsWith("zh") ? zh[key] : en[key];
		}
		function isLoopback(hostname) {
			if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]") return true;
			const parts = hostname.split(".");
			return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
		}
		function routedPath(path, href) {
			const page = new URL(href);
			if ((page.protocol === "http:" || page.protocol === "https:") && !isLoopback(page.hostname)) return `/remote${path}`;
			return path;
		}
		/** Build the authenticated local or paired-remote streaming URL. */
		function videoUrl(scope, path, href = window.location.href) {
			const params = new URLSearchParams({
				sessionId: scope.sessionId,
				path
			});
			return `${routedPath("/sidebar/video", href)}?${params.toString()}`;
		}
		/** Build the matching Better Sidebar download fallback. */
		function downloadUrl(scope, path, href = window.location.href) {
			const params = new URLSearchParams({
				sessionId: scope.sessionId,
				path,
				download: "1"
			});
			return `${routedPath("/sidebar/file", href)}?${params.toString()}`;
		}
		function VideoIcon(size) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "1.5",
					y: "3",
					width: "13",
					height: "10",
					rx: "2",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "m6 5.75 4.25 2.25L6 10.25z",
					fill: "currentColor"
				})]
			});
		}
		/** Read-only HTML video player with an explicit failure fallback. */
		function VideoView({ scope, path, title }) {
			const [failed, setFailed] = (0, react.useState)(false);
			const href = typeof window === "undefined" ? "http://127.0.0.1/" : window.location.href;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 10,
					padding: 12,
					minWidth: 0,
					minHeight: 0,
					height: "100%",
					boxSizing: "border-box"
				},
				children: [
					!failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("video", {
						src: videoUrl(scope, path, href),
						controls: true,
						preload: "metadata",
						playsInline: true,
						"aria-label": title,
						onError: () => {
							setFailed(true);
						},
						style: {
							width: "100%",
							maxHeight: "100%",
							flex: "1 1 auto",
							minHeight: 0,
							background: "#000",
							borderRadius: 6
						}
					}),
					failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "alert",
						children: t("unsupported")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 10,
							flex: "none",
							fontSize: 12,
							minWidth: 0
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							title: path,
							style: {
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								flex: "1 1 auto"
							},
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							href: downloadUrl(scope, path, href),
							download: true,
							children: t("download")
						})]
					})
				]
			});
		}
		/** Descriptor registered with the public Better Sidebar viewer service. */
		function videoViewer() {
			return {
				id: "video",
				title: () => t("viewer"),
				icon: VideoIcon,
				exts: VIDEO_EXTENSIONS,
				fetchStrategy: "none",
				component: VideoView
			};
		}
		const inject = ["betterSidebar", "locale"];
		/** Register localized copy and the viewer for this client-plugin lifetime. */
		function apply(ctx) {
			activeLocale = ctx.locale.getSnapshot().active;
			ctx.effect(() => {
				const offZh = ctx.locale.register(NS, "zh", zh);
				const offEn = ctx.locale.register(NS, "en", en);
				const subscription = ctx.locale.subscribe(() => {
					activeLocale = ctx.locale.getSnapshot().active;
				});
				return () => {
					subscription();
					offZh();
					offEn();
				};
			}, "dsh-video-preview: dictionaries");
			ctx.effect(() => ctx.betterSidebar.registerFileViewer(videoViewer()), "dsh-video-preview: viewer");
		}
		//#endregion
		exports.VIDEO_EXTENSIONS = VIDEO_EXTENSIONS;
		exports.VideoView = VideoView;
		exports.apply = apply;
		exports.downloadUrl = downloadUrl;
		exports.inject = inject;
		exports.videoUrl = videoUrl;
		exports.videoViewer = videoViewer;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map