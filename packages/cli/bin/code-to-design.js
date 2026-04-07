#!/usr/bin/env node

import { resolve } from 'node:path';

const args = process.argv.slice(2);
const skipRender = args.includes('--skip-render');
const noOpen = args.includes('--no-open');
const watchMode = args.includes('--watch') || args.includes('-w');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: code-to-design [options]

Options:
  --watch, -w     Watch for file changes and re-render automatically
  --skip-render   Skip rendering, use existing canvas data
  --no-open       Don't open browser automatically
  --help, -h      Show this help message

Environment variables:
  C2D_API_KEY        Anthropic API key for mock generation
  C2D_PORT           Canvas server port (default: 4800)
  C2D_DEV_SERVER_URL URL of an already-running dev server
`);
  process.exit(0);
}

const projectRoot = resolve(process.cwd());

const { runScan } = await import('../dist/commands/scan.js');

try {
  await runScan({
    projectRoot,
    skipRender,
    open: !noOpen,
    watch: watchMode,
  });
} catch (err) {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
}
