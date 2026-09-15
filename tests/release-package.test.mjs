import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import manifest from '../package.json' with { type: 'json' }
import { assertPackage, assertPublishContext, canonicalizeArchive, parseInputs } from '../scripts/release-package.mjs'

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
  assert.deepEqual(parseInputs(['--out', '/tmp/out', '--sidebar-tarball', '/tmp/sidebar.tgz']), { out: resolve('/tmp/out'), sidebar: resolve('/tmp/sidebar.tgz') })
  assert.throws(() => parseInputs(['--out', 'out']), /Usage/u)
})

test('ordinary pushes cannot publish', () => {
  assert.throws(() => assertPublishContext(manifest, { GITHUB_REPOSITORY: 'gestaltrun/dsh-video-preview', GITHUB_EVENT_NAME: 'push' }), /release or opted-in/u)
})

test('different gzip streams canonicalize without changing the tar', () => {
  const tar = Buffer.from('fixture tar bytes '.repeat(128))
  const linux = gzipSync(tar, { level: 1, mtime: 0 })
  const macos = gzipSync(tar, { level: 9, mtime: 0 })
  linux[9] = 3
  macos[9] = 19
  const linuxBefore = Buffer.from(linux)
  const macosBefore = Buffer.from(macos)
  assert.notDeepEqual(linux, macos)
  const normalizedLinux = canonicalizeArchive(linux)
  const normalizedMacos = canonicalizeArchive(macos)
  assert.equal(normalizedLinux[9], 255)
  assert.deepEqual(normalizedLinux, normalizedMacos)
  assert.deepEqual(gunzipSync(normalizedLinux), tar)
  assert.deepEqual(canonicalizeArchive(normalizedLinux), normalizedLinux)
  assert.deepEqual(linux, linuxBefore)
  assert.deepEqual(macos, macosBefore)
})

test('gzip normalization rejects optional headers and corrupt trailers', () => {
  const optional = gzipSync(Buffer.from('fixture'))
  optional[3] = 4
  assert.throws(() => canonicalizeArchive(optional), /optional gzip headers/u)
  const corrupt = gzipSync(Buffer.from('fixture'))
  corrupt[corrupt.length - 8] ^= 0xff
  assert.throws(() => canonicalizeArchive(corrupt), /invalid gzip payload or trailer/u)
  const wrongMethod = gzipSync(Buffer.from('fixture'))
  wrongMethod[2] = 0
  assert.throws(() => canonicalizeArchive(wrongMethod), /gzip deflate/u)
  assert.throws(() => canonicalizeArchive(Buffer.from([0x1f, 0x8b, 8])), /truncated gzip/u)
})
