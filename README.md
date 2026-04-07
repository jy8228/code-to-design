# Code to Design

AI-powered UI review canvas for Next.js projects. Renders every page and state variant onto an infinite canvas for visual review and team feedback.

## How It Works

1. **Scans** your Next.js App Router `app/` directory for all routes
2. **Analyzes** each page's code to find API dependencies and auth patterns
3. **Generates** realistic mock data using Claude AI (Anthropic API)
4. **Pre-renders** every page in 4 states: success, empty, error, loading
5. **Opens** an interactive canvas where you can zoom, pan, comment, and draw

## Requirements

- **Node.js** 18+
- **Next.js** App Router project (Pages Router not yet supported)
- **Anthropic API key** for AI mock generation ([get one here](https://console.anthropic.com/))
- **Playwright** Chromium browser (installed automatically on first run)

## Quick Start

```bash
# 1. Set your Anthropic API key
export C2D_API_KEY=sk-ant-xxxxx

# 2. Navigate to your Next.js project
cd your-nextjs-project

# 3. Run Code to Design
npx code-to-design
```

The canvas opens at `http://localhost:4800` with all your pages rendered.

## API Key Setup

Code to Design uses the Claude API to analyze your code and generate realistic mock data. Without an API key, it falls back to empty mock data (pages may show loading spinners).

**Option 1: Environment variable** (recommended)
```bash
export C2D_API_KEY=sk-ant-xxxxx
```

**Option 2: Config file** — create `c2d.config.js` in your project root:
```js
export default {
  apiKey: 'sk-ant-xxxxx',
  port: 4800,            // canvas server port (default: 4800)
  excludeRoutes: [],     // routes to skip (e.g. ['/admin'])
}
```

## Features

### Canvas

| Feature | Description |
|---|---|
| **Zoom / Pan** | Scroll to pan, Ctrl+Scroll to zoom. Zoom buttons and zoom-to-fit in the toolbar. |
| **Page Previews** | Screenshots at bird's-eye view (fast), live HTML with full CSS when zoomed in. Double-click a page to interact with it. |
| **State Expansion** | Each page is rendered in 4 states: success, empty, error, loading — displayed as a grid on the canvas. |
| **Comments** | Click the comment tool (or press C), then click anywhere on the canvas to leave a note. Comments are persisted across sessions and synced between users every 5 seconds. |
| **Drawing** | Freehand pen tool (press D) for quick annotations. Strokes are saved across sessions. |
| **Error Display** | Pages that fail to render show a styled error card with the error message instead of a broken image. |
| **Viewport Culling** | Only pages visible on screen are rendered to the DOM. Handles large projects (50+ pages) without performance issues. |

### CLI

| Feature | Description |
|---|---|
| **Zero Config** | Point it at any Next.js App Router project, no setup needed. |
| **AI Mock Generation** | Claude analyzes your code's TypeScript types and API calls to generate realistic mock data automatically. |
| **Auth Bypass** | Automatically detects cookie-based auth (middleware.ts) and injects mock credentials so protected pages render correctly. |
| **Watch Mode** | `--watch` flag re-renders pages automatically when source files change. |
| **Multi-View** | Render pages at multiple viewport sizes (desktop, mobile) in a single run. |
| **LAN Sharing** | Canvas server is accessible to anyone on the same network for team review. |

### Smart Analysis

| Feature | Description |
|---|---|
| **Route Discovery** | Scans `app/` directory following Next.js conventions — handles route groups `(name)`, dynamic routes `[param]`, catch-all `[...slug]`, private folders `_name`. |
| **Import Tracing** | Follows `import` statements up to 2 levels deep, resolves `@/` path aliases from tsconfig.json, extracts API client code and TypeScript types for accurate mock generation. |
| **Auth Detection** | Scans `middleware.ts` for cookie names, detects auth context providers, mocks common auth endpoints (`/auth/me`, `/auth/session`). |

## CLI Options

```
vibecanvas [options]

Options:
  --watch, -w     Watch for file changes and re-render automatically
  --skip-render   Use previously rendered pages (skip AI + rendering)
  --no-open       Don't open browser automatically
  --help, -h      Show help

Environment variables:
  C2D_API_KEY        Anthropic API key
  C2D_PORT           Server port (default: 4800)
  C2D_DEV_SERVER_URL URL of an already-running dev server
```

## Supported Stack

| | Supported | Notes |
|---|---|---|
| **Next.js App Router** | Yes | Primary target |
| **Next.js Pages Router** | No | Planned |
| **React + Vite** | No | Planned |
| **React + CRA** | No | Planned |
| **Vue, Svelte, etc.** | No | Not planned |

## How It Renders Pages

Code to Design does **not** modify your project. It:

1. Starts your dev server (`next dev`) on a temporary port
2. Uses Playwright to open each route in a headless browser
3. Intercepts all API calls via Playwright's `page.route()` and injects AI-generated mock data
4. Injects auth cookies to bypass login middleware
5. Captures the rendered page as static HTML with inlined CSS + a screenshot
6. Stops the dev server

The rendered HTML is self-contained — no external dependencies needed to view it.

## Development

```bash
# Install dependencies
npm install

# Run tests (50 tests: 38 core + 12 CLI)
npm test

# TypeScript check
npx tsc --project packages/core/tsconfig.json --noEmit
npx tsc --project packages/cli/tsconfig.json --noEmit
npx tsc --project apps/canvas/tsconfig.json --noEmit

# Build canvas app
cd apps/canvas && npx vite build

# Build CLI for npm (bundles core + canvas app)
cd packages/cli && npm run prepublishOnly

# Development mode (run against any Next.js project)
export C2D_API_KEY=sk-ant-xxxxx
npm run code-to-design -- /path/to/nextjs-project

# Watch mode (auto re-render on file changes)
npm run code-to-design -- /path/to/nextjs-project --watch
```

## Project Structure

```
packages/
  core/         # Route discovery, code analysis, mock generation, pre-rendering
  cli/          # CLI orchestrator, canvas server, API endpoints
apps/
  canvas/       # Interactive canvas UI (React, custom canvas — no external library)
scripts/        # Dev/test scripts (run-single, serve-only, debug-mocks)
docs/
  brainstorms/  # Requirements documents
  plans/        # Implementation plans and roadmap
  research/     # Spike results and technical investigation
```

## License

MIT
