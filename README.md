# @gestaltrun/dsh-video-preview

Read-only inline video viewing for `@gestaltrun/dsh-better-sidebar`. The client registers one `video` file viewer; the host serves the selected session file through `/sidebar/video` with single-range HTTP streaming.

## Compatibility and composition

- DSH `0.1.5-rc.2`
- `@gestaltrun/dsh-better-sidebar@0.19.1-gestaltrun.0`
- one shared `@deepseek-ai/cordis` instance supplied by the profile
- Node `^22.19.0 || >=24.0.0`

The package is a profile bundle. Its patch inserts the dual-face plugin row, while the client manifest orders the viewer after the DSH locale service and Better Sidebar. It adds no Agent tools or preset entries.

```sh
dsh plugin --profile desktop add @gestaltrun/dsh-video-preview@0.1.5-gestaltrun.0
```

The route accepts only `GET` and `HEAD`, only known video extensions, and only canonical files inside the live session workspace. Both the workspace and target pass through `realpath`, so a symlink inside the workspace cannot expose a file outside it. Byte ranges, suffix ranges, `If-Range`, `HEAD`, and client cancellation are supported.

Desktop requests are accepted only when the Host-owned `desktopPrivateHttp` service recognizes the original private request object. Every other request uses the official Connection service's Host, Origin, and browser-auth decision. A remote Desktop URL uses the existing paired `/remote/sidebar/*` channel before the request returns to this route.

Playback still depends on browser codec support. Unsupported containers remain downloadable through Better Sidebar.

## Source and license

This fork retains the MIT license and originates from `zemul/dsh-video-preview@3e51dc73fe4de33e65475fd457bc2608f5dce3bd`. Gestaltrun changes add current DSH/Sidebar interfaces, canonical workspace authorization, cancellation, strict range behavior, and reproducible candidate packaging.
