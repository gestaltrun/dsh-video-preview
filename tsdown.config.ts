/** Host ESM and browser client-module builds. */
import type { UserConfig } from 'tsdown'

const CLIENT_ID = '@gestaltrun/dsh-video-preview'
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@gestaltrun/dsh-better-sidebar']

const host: UserConfig = {
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2023',
  dts: false,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  external: [/^node:/u, /^@deepseek-ai\//u],
}

const client: UserConfig = {
  entry: { client: 'src/client.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2023',
  dts: false,
  sourcemap: true,
  clean: false,
  external: CLIENT_EXTERNALS,
  noExternal: id => CLIENT_EXTERNALS.includes(id) ? undefined : true,
  outputOptions: {
    entryFileNames: 'client.js',
    codeSplitting: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
}

export default [host, client] satisfies UserConfig[]
