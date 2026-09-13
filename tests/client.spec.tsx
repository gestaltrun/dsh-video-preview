import { describe, expect, it } from 'vitest'
import { downloadUrl, videoUrl, videoViewer } from '../src/client.tsx'

const scope = { sessionId: 'session-1', cwd: '/workspace' }

describe('video viewer', () => {
  it('registers the supported formats through the public viewer interface', () => {
    const viewer = videoViewer()
    expect(viewer.id).toBe('video')
    expect(viewer.fetchStrategy).toBe('none')
    expect(viewer.exts).toContain('mp4')
    expect(viewer.exts).toContain('webm')
    expect(viewer.component).toBeTypeOf('function')
  })

  it('uses the private route locally and the paired channel remotely', () => {
    expect(videoUrl(scope, '/workspace/a.mp4', 'dsh-app://app/')).toMatch(/^\/sidebar\/video\?/u)
    expect(videoUrl(scope, '/workspace/a.mp4', 'http://127.0.0.1:3000/')).toMatch(/^\/sidebar\/video\?/u)
    expect(videoUrl(scope, '/workspace/a.mp4', 'https://desktop.example/')).toMatch(/^\/remote\/sidebar\/video\?/u)
    expect(downloadUrl(scope, '/workspace/a.mp4', 'https://desktop.example/')).toMatch(/^\/remote\/sidebar\/file\?/u)
  })
})
