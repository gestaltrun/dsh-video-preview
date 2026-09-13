import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync, gunzipSync } from 'node:zlib'
import manifest from '../package.json' with { type: 'json' }
import { assertPackage, assertPublishContext, normalizeGzipPlatform, parseInputs } from '../scripts/release-package.mjs'

test('fork identity and exact Sidebar peer pass the release guard', () => {
  assert.doesNotThrow(() => assertPackage(manifest))
})

test('development dependency references are rejected', () => {
  assert.throws(() => assertPackage({ ...manifest, dependencies: { renderer: 'file:../renderer' } }), /unpublished dependency/u)
})

test('React 18 compatible peers are required', () => {
  assert.throws(() => assertPackage({ ...manifest, peerDependencies: { ...manifest.peerDependencies, react: '18.2.0' } }), /React peer/u)
})

test('product packer inputs require absolute output and Sidebar paths', () => {
  assert.deepEqual(parseInputs(['--out', '/tmp/out', '--sidebar-tarball', '/tmp/sidebar.tgz']), { out: '/tmp/out', sidebar: '/tmp/sidebar.tgz' })
  assert.throws(() => parseInputs(['--out', 'out']), /Usage/u)
})

test('ordinary pushes cannot publish', () => {
  assert.throws(() => assertPublishContext(manifest, { GITHUB_REPOSITORY: 'gestaltrun/dsh-video-preview', GITHUB_EVENT_NAME: 'push' }), /release or opted-in/u)
})

test('gzip platform bytes normalize without changing the tar', () => {
  const tar = Buffer.from('fixture tar bytes')
  const linux = gzipSync(tar, { mtime: 0 })
  const macos = Buffer.from(linux)
  linux[9] = 3
  macos[9] = 13
  const normalizedLinux = normalizeGzipPlatform(linux)
  const normalizedMacos = normalizeGzipPlatform(macos)
  assert.equal(normalizedLinux[9], 255)
  assert.deepEqual(normalizedLinux, normalizedMacos)
  assert.deepEqual(gunzipSync(normalizedLinux), tar)
})

test('gzip normalization rejects optional headers and corrupt trailers', () => {
  const optional = gzipSync(Buffer.from('fixture'))
  optional[3] = 4
  assert.throws(() => normalizeGzipPlatform(optional), /optional gzip headers/u)
  const corrupt = gzipSync(Buffer.from('fixture'))
  corrupt[corrupt.length - 8] ^= 0xff
  assert.throws(() => normalizeGzipPlatform(corrupt), /invalid gzip payload or trailer/u)
  const wrongMethod = gzipSync(Buffer.from('fixture'))
  wrongMethod[2] = 0
  assert.throws(() => normalizeGzipPlatform(wrongMethod), /gzip deflate/u)
  assert.throws(() => normalizeGzipPlatform(Buffer.from([0x1f, 0x8b, 8])), /truncated gzip/u)
})
