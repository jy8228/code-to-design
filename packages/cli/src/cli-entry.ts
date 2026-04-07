/**
 * Development CLI entry point (run via tsx without building).
 * Usage: node --import tsx packages/cli/src/cli-entry.ts [options]
 *   or:  npm run code-to-design -- [options]
 */
import { resolve } from 'node:path';
import { runScan } from './commands/scan.js';

const args = process.argv.slice(2);
const skipRender = args.includes('--skip-render');
const noOpen = args.includes('--no-open');
const watchMode = args.includes('--watch') || args.includes('-w');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: code-to-design [options]

Scans a Next.js App Router project, generates mock data with AI,
pre-renders all pages, and opens an interactive canvas for review.

Options:
  --watch, -w     Watch for file changes and re-render automatically
  --skip-render   Skip rendering, use existing canvas data
  --no-open       Don't open browser automatically
  --help, -h      Show this help message

Environment variables:
  C2D_API_KEY        Anthropic API key for mock generation
  C2D_PORT           Canvas server port (default: 4800)
  C2D_DEV_SERVER_URL URL of an already-running dev server

Config file (optional):
  Create code-to-design.config.js in your project root:
    export default {
      apiKey: 'sk-ant-...',
      port: 4800,
      excludeRoutes: ['/admin'],
    }
`);
  process.exit(0);
}

const projectRoot = resolve(args.find(a => !a.startsWith('-')) || process.cwd());

try {
  await runScan({ projectRoot, skipRender, open: !noOpen, watch: watchMode });
} catch (err: any) {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
}
