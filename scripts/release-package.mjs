#!/usr/bin/env node
/** Build, verify, and optionally publish the Gestaltrun video viewer. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
export const PACKAGE_NAME = '@gestaltrun/dsh-video-preview'
export const REPOSITORY = 'gestaltrun/dsh-video-preview'
export const SIDEBAR_NAME = '@gestaltrun/dsh-better-sidebar'
export const SIDEBAR_VERSION = '0.19.1-gestaltrun.0'

/** Validate package identity, dependencies, and candidate publication policy. */
export function assertPackage(manifest, packed = false) {
  if (manifest.name !== PACKAGE_NAME) throw new Error(`Package name must be ${PACKAGE_NAME}`)
  if (manifest.repository?.url !== `https://github.com/${REPOSITORY}`) throw new Error(`Repository must be ${REPOSITORY}`)
  if (manifest.license !== 'MIT') throw new Error('The upstream MIT license must be retained')
  if (!packed && manifest.packageManager !== 'pnpm@11.8.0') throw new Error('packageManager must be pnpm@11.8.0')
  if (manifest.publishConfig?.registry !== 'https://registry.npmjs.org/' || manifest.publishConfig?.access !== 'public') {
    throw new Error('publishConfig must select public npm')
  }
  if (manifest.publishConfig?.tag !== 'candidate') throw new Error('Prereleases must use the candidate tag')
  if (manifest.peerDependencies?.[SIDEBAR_NAME] !== SIDEBAR_VERSION) throw new Error('Sidebar peer must be pinned exactly')
  if (manifest.peerDependencies?.react !== '^18.2.0') throw new Error('React peer must accept the DSH React 18 cohort')
  if (manifest.devDependencies?.fflate !== '0.8.3') throw new Error('Archive canonicalization requires fflate@0.8.3')
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (name in (manifest.scripts ?? {})) throw new Error(`Install lifecycle ${name} is forbidden`)
  }
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (typeof version !== 'string' || /^(?:file|link|workspace):/u.test(version)) {
        throw new Error(`${section} contains an unpublished dependency ${name}`)
      }
    }
  }
}

/** Parse the product packer's explicit output and Sidebar inputs. */
export function parseInputs(args) {
  const values = args[0] === '--' ? args.slice(1) : args
  const outAt = values.indexOf('--out')
  const sidebarAt = values.indexOf('--sidebar-tarball')
  if (values.length !== 4 || outAt < 0 || sidebarAt < 0 || !isAbsolute(values[outAt + 1] ?? '') || !isAbsolute(values[sidebarAt + 1] ?? '')) {
    throw new Error('Usage: release:pack -- --out <absolute-directory> --sidebar-tarball <absolute-tarball>')
  }
  return { out: resolve(values[outAt + 1]), sidebar: resolve(values[sidebarAt + 1]) }
}

/** Verify the exact Sidebar archive supplied by the product release set. */
export function assertSidebarTarball(path) {
  if (!existsSync(path)) throw new Error(`Sidebar tarball does not exist: ${path}`)
  const manifest = JSON.parse(execFileSync('tar', ['-xOzf', path, 'package/package.json'], { encoding: 'utf8' }))
  if (manifest.name !== SIDEBAR_NAME || manifest.version !== SIDEBAR_VERSION) throw new Error(`Expected ${SIDEBAR_NAME}@${SIDEBAR_VERSION}`)
}

function runPnpm(args) {
  const cli = process.env.npm_execpath
  if (!cli) throw new Error('Run release commands through pnpm')
  execFileSync(process.execPath, [cli, ...args], { cwd: ROOT, stdio: 'inherit' })
}

function installBuildGraph(sidebar) {
  runPnpm(['install', '--frozen-lockfile', '--ignore-scripts'])
  assertSidebarTarball(sidebar)
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-video-preview-'))
  try {
    execFileSync('tar', ['-xzf', sidebar, '-C', scratch])
    const target = join(ROOT, 'node_modules', '@gestaltrun', 'dsh-better-sidebar')
    rmSync(target, { recursive: true, force: true })
    mkdirSync(dirname(target), { recursive: true })
    cpSync(join(scratch, 'package'), target, { recursive: true })
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function tarballName(manifest) {
  return `${manifest.name.replace(/^@/u, '').replace('/', '-')}-${manifest.version}.tgz`
}

/** Recompress npm's archive deterministically while proving the tar stays unchanged. */
export function canonicalizeArchive(input) {
  if (!Buffer.isBuffer(input) || input.length < 18) throw new Error('Packed archive has a truncated gzip header or trailer')
  if (input[0] !== 0x1f || input[1] !== 0x8b || input[2] !== 8) throw new Error('Packed archive must use gzip deflate')
  if (input[3] !== 0) throw new Error('Packed archive must not use optional gzip headers')
  let tar
  try {
    tar = gunzipSync(input)
  } catch (error) {
    throw new Error('Packed archive has an invalid gzip payload or trailer', { cause: error })
  }
  const { gzipSync } = require('fflate')
  const canonical = Buffer.from(gzipSync(tar, { level: 9, mtime: 0 }))
  if (canonical.length < 18 || canonical[0] !== 0x1f || canonical[1] !== 0x8b || canonical[2] !== 8 || canonical[3] !== 0) {
    throw new Error('fflate emitted a non-canonical gzip header')
  }
  canonical[9] = 255
  if (!gunzipSync(canonical).equals(tar)) throw new Error('Archive canonicalization changed the packed tar')
  return canonical
}

function normalizePackedArchive(path) {
  writeFileSync(path, canonicalizeArchive(readFileSync(path)))
}

function pack(manifest, inputs) {
  installBuildGraph(inputs.sidebar)
  runPnpm(['run', 'build'])
  runPnpm(['run', 'typecheck'])
  runPnpm(['run', 'test'])
  runPnpm(['run', 'test:release'])
  mkdirSync(inputs.out, { recursive: true })
  const tarball = join(inputs.out, tarballName(manifest))
  if (existsSync(tarball)) throw new Error(`Artifact already exists: ${tarball}`)
  runPnpm(['pack', '--pack-destination', inputs.out])
  normalizePackedArchive(tarball)
  const packed = JSON.parse(execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' }))
  assertPackage(packed, true)
  const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n')
  for (const required of ['package/lib/index.js', 'package/lib/client.js', 'package/cordis.patch.yml', 'package/LICENSE']) {
    if (!files.includes(required)) throw new Error(`Packed artifact omits ${required}`)
  }
  const client = execFileSync('tar', ['-xOzf', tarball, 'package/lib/client.js'], { encoding: 'utf8' })
  if (!client.includes(`id: "${PACKAGE_NAME}"`) || !client.includes('window.__ModuleLoader__.load')) throw new Error('Packed client entry has the wrong module id')
  const host = execFileSync('tar', ['-xOzf', tarball, 'package/lib/index.js'], { encoding: 'utf8' })
  if (!host.includes('/sidebar/video') || !host.includes('requestRejection') || !host.includes('realpath')) throw new Error('Packed host entry omits the reviewed route guards')
  const digest = createHash('sha512').update(readFileSync(tarball)).digest('base64')
  console.log(`Artifact: ${tarball}`)
  console.log(`Integrity: sha512-${digest}`)
  return tarball
}

/** Require a release tag or opted-in manual workflow before publication. */
export function assertPublishContext(manifest, env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY) throw new Error(`Publishing requires ${REPOSITORY}`)
  if (env.GITHUB_EVENT_NAME === 'release') {
    if (env.RELEASE_TAG !== `v${manifest.version}` || env.GITHUB_REF !== `refs/tags/v${manifest.version}`) throw new Error('Release tag must match package version')
    return
  }
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.PUBLISH_PACKAGE !== 'true') throw new Error('Publishing requires a release or opted-in manual workflow')
}

function main() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const [command, ...args] = process.argv.slice(2)
  assertPackage(manifest)
  if (command === 'guard') {
    assertPublishContext(manifest, process.env)
    return
  }
  if (command !== 'pack' && command !== 'publish') throw new Error('Expected pack or publish')
  const inputs = parseInputs(args)
  if (command === 'publish') assertPublishContext(manifest, process.env)
  const tarball = pack(manifest, inputs)
  if (command === 'publish') {
    execFileSync('npm', ['publish', tarball, '--ignore-scripts', '--provenance', '--access', 'public', '--registry', 'https://registry.npmjs.org/', '--tag', 'candidate'], { cwd: ROOT, stdio: 'inherit' })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
