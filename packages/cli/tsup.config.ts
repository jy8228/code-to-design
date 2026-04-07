import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'commands/scan': 'src/commands/scan.ts',
    index: 'src/index.ts',
  },
  format: 'esm',
  target: 'node18',
  platform: 'node',
  splitting: true,
  sourcemap: true,
  dts: true,
  clean: true,
  // Bundle @code-to-design/core inline so the CLI package is self-contained
  noExternal: ['@code-to-design/core'],
  // Keep runtime deps as external — they'll be installed via dependencies
  external: ['@anthropic-ai/sdk', 'playwright', 'sirv'],
});
