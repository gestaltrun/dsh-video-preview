/** Better Sidebar video viewer registration. */
import { createElement, useState } from 'react'
import type { Context, FileViewerDescriptor, FileViewerProps } from '@gestaltrun/dsh-better-sidebar'

type SessionScope = FileViewerProps['scope']

const NS = 'dsh-video-preview'
const zh = { viewer: '视频', download: '下载', unsupported: '浏览器无法播放此视频格式。' }
const en = { viewer: 'Video', download: 'Download', unsupported: 'This browser cannot play the video format.' }
type CopyKey = keyof typeof en
let activeLocale = 'en'

/** File extensions claimed by the viewer. */
export const VIDEO_EXTENSIONS = [
  'mp4', 'm4v', 'webm', 'ogv', 'ogg', 'mov', 'qt', 'mkv', 'avi', 'wmv', 'flv', 'm2ts', 'mpeg', 'mpg', '3gp', '3g2',
] as const

function t(key: CopyKey): string {
  return activeLocale.toLowerCase().startsWith('zh') ? zh[key] : en[key]
}

function isLoopback(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^\d{1,3}$/u.test(part) && Number(part) <= 255)
}

function routedPath(path: string, href: string): string {
  const page = new URL(href)
  if ((page.protocol === 'http:' || page.protocol === 'https:') && !isLoopback(page.hostname)) return `/remote${path}`
  return path
}

/** Build the authenticated local or paired-remote streaming URL. */
export function videoUrl(scope: SessionScope, path: string, href = window.location.href): string {
  const params = new URLSearchParams({ sessionId: scope.sessionId, path })
  return `${routedPath('/sidebar/video', href)}?${params.toString()}`
}

/** Build the matching Better Sidebar download fallback. */
export function downloadUrl(scope: SessionScope, path: string, href = window.location.href): string {
  const params = new URLSearchParams({ sessionId: scope.sessionId, path, download: '1' })
  return `${routedPath('/sidebar/file', href)}?${params.toString()}`
}

function VideoIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m6 5.75 4.25 2.25L6 10.25z" fill="currentColor" />
    </svg>
  )
}

/** Read-only HTML video player with an explicit failure fallback. */
export function VideoView({ scope, path, title }: FileViewerProps) {
  const [failed, setFailed] = useState(false)
  const href = typeof window === 'undefined' ? 'http://127.0.0.1/' : window.location.href
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, minWidth: 0, minHeight: 0, height: '100%', boxSizing: 'border-box' }}>
      {!failed && (
        <video
          src={videoUrl(scope, path, href)}
          controls
          preload="metadata"
          playsInline
          aria-label={title}
          onError={() => { setFailed(true) }}
          style={{ width: '100%', maxHeight: '100%', flex: '1 1 auto', minHeight: 0, background: '#000', borderRadius: 6 }}
        />
      )}
      {failed && <div role="alert">{t('unsupported')}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', fontSize: 12, minWidth: 0 }}>
        <span title={path} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' }}>{title}</span>
        <a href={downloadUrl(scope, path, href)} download>{t('download')}</a>
      </div>
    </div>
  )
}

/** Descriptor registered with the public Better Sidebar viewer service. */
export function videoViewer(): FileViewerDescriptor {
  return {
    id: 'video',
    title: () => t('viewer'),
    icon: VideoIcon,
    exts: VIDEO_EXTENSIONS,
    fetchStrategy: 'none',
    component: VideoView,
  }
}

export const inject = ['betterSidebar', 'locale']

/** Register localized copy and the viewer for this client-plugin lifetime. */
export function apply(ctx: Context): void {
  activeLocale = ctx.locale.getSnapshot().active
  ctx.effect(() => {
    const offZh = ctx.locale.register(NS, 'zh', zh)
    const offEn = ctx.locale.register(NS, 'en', en)
    const subscription = ctx.locale.subscribe(() => { activeLocale = ctx.locale.getSnapshot().active })
    return () => { subscription(); offZh(); offEn() }
  }, 'dsh-video-preview: dictionaries')
  ctx.effect(() => ctx.betterSidebar.registerFileViewer(videoViewer()), 'dsh-video-preview: viewer')
}
