import assert from 'node:assert/strict'
import test from 'node:test'
import manifest from '../package.json' with { type: 'json' }
import { assertPackage, assertPublishContext, parseInputs } from '../scripts/release-package.mjs'

test('fork identity and exact Sidebar peer pass the release guard', () => {
  assert.doesNotThrow(() => assertPackage(manifest))
})

test('development dependency references are rejected', () => {
  assert.throws(() => assertPackage({ ...manifest, peerDependencies: { ...manifest.peerDependencies, react: 'file:../react' } }), /unpublished dependency/u)
})

test('product packer inputs require absolute output and Sidebar paths', () => {
  assert.deepEqual(parseInputs(['--out', '/tmp/out', '--sidebar-tarball', '/tmp/sidebar.tgz']), { out: '/tmp/out', sidebar: '/tmp/sidebar.tgz' })
  assert.throws(() => parseInputs(['--out', 'out']), /Usage/u)
})

test('ordinary pushes cannot publish', () => {
  assert.throws(() => assertPublishContext(manifest, { GITHUB_REPOSITORY: 'gestaltrun/dsh-video-preview', GITHUB_EVENT_NAME: 'push' }), /release or opted-in/u)
})
