# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Code to Design is an AI-powered UI review platform that renders all pages and states from a code repository onto an infinite canvas (like Figma) for visual collaboration. It follows an Open-Core strategy: the core engine and CLI are open-source, while collaboration features (commenting, visual diff, PR previews) are a paid cloud service.

## Repository Strategy

This repo is the **private monorepo** containing both open-source and proprietary code. A separate public repo mirrors only the open-source packages via GitHub Actions.

## Planned Monorepo Structure

```
packages/
  core/       # OSS - UI analysis, canvas rendering engine
  cli/        # OSS - `npx code-to-design` entry point
  theme/      # OSS - shared design assets
apps/
  landing-page/     # Public - product site & docs
  cloud-platform/   # Private - SaaS (auth, billing, team mgmt)
infra/              # Private - deployment configs
```

## Tech Stack

| Layer | Technology |
|---|---|
| Core Engine | TypeScript, Vite (HMR-based rendering) |
| Canvas | tldraw or Excalidraw (customized) |
| Component Analysis | TypeScript AST, React-Docgen |
| Data Mocking | MSW (Mock Service Worker) |
| Frontend (Landing/Cloud) | Next.js + TypeScript |
| Backend | Python + FastAPI |
| UI Library | shadcn/ui |
| Deployment | Vercel (frontend), AWS (backend) |

## Development

### Setup

```bash
npm install
```

### Run Tests

```bash
npm test                    # all tests (core 38 + cli 12)
cd packages/core && npx vitest run   # core only
cd packages/cli && npx vitest run    # cli only
```

### E2E Test (against a Next.js project)

```bash
# 1. Set API key
export C2D_API_KEY=sk-ant-xxxxx

# 2. Render pages (runs the full pipeline: discover → analyze → mock → render)
node --import tsx scripts/run-single.ts

# 3. Start API server (serves manifest + rendered files)
node --import tsx scripts/serve-only.ts &

# 4. Start canvas dev server (tldraw UI)
cd apps/canvas && npx vite --host

# 5. Open http://localhost:5173
```

### TypeScript Check

```bash
npx tsc --project packages/core/tsconfig.json --noEmit
npx tsc --project packages/cli/tsconfig.json --noEmit
npx tsc --project apps/canvas/tsconfig.json --noEmit
```

## Key Concepts

- **Auto-Extraction**: Analyzes project routes and components to auto-layout pages on canvas
- **State Expansion**: AI generates variant states (loading, error, empty) with mock data injection
- **Visual Collaboration**: Comments on canvas coordinates sync to code lines and ticket systems

## Workspace Rules

This project inherits from the parent workspace at `/Users/jaeyeonnoh/monadlabs/`. Follow the rule system in `../../rules/00_MASTER_RULE.md` for routing requests (Strategy → RULE-10, Requirements → RULE-20, Research → RULE-30, Execution → RULE-40, Marketing → RULE-50).

## File Conventions

- Save all outputs to files under `docs/` with appropriate subdirectories (strategy, specs, research, execution, marketing)
- Use snake_case with type prefix: `prd_canvas_engine.md`, `story_state_expansion.md`


## Language
Use only English in all the documents in this project.
