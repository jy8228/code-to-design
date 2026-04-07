import { join } from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
import { existsSync, watch as fsWatch } from 'node:fs';
import {
  scanRoutes,
  analyzePage,
  generateMocks,
  preRenderPages,
  type RenderTask,
  type MockGeneratorOptions,
} from '@code-to-design/core';
import { startCanvasServer } from '../server/canvas-server.js';
import { loadConfig, detectProject } from '../config.js';
import * as ui from '../utils/progress.js';

/**
 * Main scan command — runs the full Code to Design pipeline.
 *
 * 1. Detect project type
 * 2. Discover routes
 * 3. Analyze code + generate mocks
 * 4. Pre-render pages
 * 5. Start canvas server
 */
export async function runScan(options: {
  projectRoot: string;
  skipRender?: boolean;
  open?: boolean;
  watch?: boolean;
}): Promise<void> {
  const { projectRoot, skipRender = false, open = true, watch = false } = options;

  ui.banner();

  // Load config
  const config = await loadConfig(projectRoot);

  // Step 1: Detect project
  ui.header('Detecting project...');
  const project = await detectProject(projectRoot);

  if (!project.isSupported) {
    ui.error('Unsupported project type.');
    ui.log('Code to Design supports Next.js (App Router / Pages Router) and React Router (Vite) projects.');
    process.exit(1);
  }

  if (project.projectType !== 'react-router' && !project.appDir) {
    ui.error('No app/ or pages/ directory found.');
    process.exit(1);
  }

  ui.success(`Project: ${project.projectName} (${project.projectType})`);
  if (project.appDir) {
    ui.success(`App directory: ${project.appDir}`);
  }

  const c2dDir = join(projectRoot, '.c2d');

  // If --skip-render, just start the server with existing renders
  if (skipRender) {
    if (!existsSync(join(c2dDir, 'manifest.json'))) {
      ui.error('No previous renders found. Run without --skip-render first.');
      process.exit(1);
    }
    ui.log('Skipping render, using existing canvas data...');
    await startServer(c2dDir, config.port, open, projectRoot);
    return;
  }

  // Step 2: Discover routes
  ui.header('Discovering routes...');
  const scanDir = project.projectType === 'react-router' ? project.projectRoot : project.appDir!;
  const routerType = project.projectType === 'react-router' ? 'react-router' as const
    : project.projectType === 'nextjs-pages' ? 'pages-router' as const
    : 'app-router' as const;
  const routes = await scanRoutes({ appDir: scanDir, routerType });

  if (routes.length === 0) {
    ui.error('No routes found in app/ directory.');
    process.exit(1);
  }

  // Filter excluded routes
  const filteredRoutes = routes.filter(
    (r) => !config.excludeRoutes.some((pattern: string) => r.urlPath.includes(pattern)),
  );

  ui.success(`Found ${filteredRoutes.length} routes`);
  for (const r of filteredRoutes) {
    ui.log(`  ${r.urlPath}${r.isDynamic ? ' [dynamic]' : ''}`);
  }

  // Step 3: Check API key — prompt if not set
  if (!config.apiKey) {
    ui.warn('No API key configured.');
    ui.log('  An Anthropic API key enables AI-powered mock generation.');
    ui.log('  Without it, pages render with generic fallback data.');
    ui.log('  Get a key at: https://console.anthropic.com/');
    ui.log('');

    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const inputKey = await new Promise<string>((resolve) => {
      rl.question('  Enter C2D_API_KEY (or press Enter to skip): ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    if (inputKey) {
      config.apiKey = inputKey;
      ui.success('API key set for this session.');
      ui.log('  To avoid this prompt, run: export C2D_API_KEY=sk-ant-xxxxx');
    } else {
      ui.log('  Skipping AI mock generation. Using fallback data.');
    }
    ui.log('');
  }

  // Step 4: Analyze and generate mocks
  ui.header('Analyzing code and generating mocks...');

  const renderTasks: RenderTask[] = [];
  let totalTokens = { input: 0, output: 0 };

  const mockOptions: MockGeneratorOptions = {
    apiKey: config.apiKey,
  };

  for (let i = 0; i < filteredRoutes.length; i++) {
    const route = filteredRoutes[i];
    ui.step(i + 1, filteredRoutes.length, `${route.urlPath}`);

    // Analyze page
    const analysis = await analyzePage(route, { projectRoot });

    // Generate mocks
    const { configs, tokenUsage } = await generateMocks(analysis, mockOptions);
    totalTokens.input += tokenUsage.input;
    totalTokens.output += tokenUsage.output;

    // Create render tasks
    for (const mockConfig of configs) {
      renderTasks.push({
        route,
        mockConfig,
        authConfig: analysis.authConfig,
      });
    }
  }

  if (totalTokens.input > 0) {
    ui.success(`Mock generation complete (${totalTokens.input} input tokens, ${totalTokens.output} output tokens)`);
  } else {
    ui.success('Using fallback mocks (no API key or no API dependencies)');
  }

  // Step 5: Pre-render
  ui.header(`Pre-rendering ${renderTasks.length} page states...`);

  // Clear previous renders but preserve comments
  if (existsSync(join(c2dDir, 'renders'))) {
    await rm(join(c2dDir, 'renders'), { recursive: true });
  }
  await mkdir(c2dDir, { recursive: true });

  const { results, manifest } = await preRenderPages(renderTasks, {
    projectRoot,
    outputDir: c2dDir,
    devServerUrl: config.devServerUrl,
    onProgress: (completed, total, result) => {
      const pct = Math.round((completed / total) * 100);
      const icon = result.success ? '✓' : '✗';
      const label = `${result.route.urlPath} [${result.stateName}]`;
      process.stdout.write(`\r  ${icon} ${completed}/${total} (${pct}%) ${label}${''.padEnd(20)}`);
      if (completed === total) process.stdout.write('\n');
    },
  });

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  ui.success(`Rendered ${successCount}/${results.length} pages`);
  if (failCount > 0) {
    ui.warn(`${failCount} pages failed to render`);
    for (const r of results.filter((r) => !r.success)) {
      ui.error(`  ${r.route.urlPath} [${r.stateName}]: ${r.error}`);
    }
  }

  // Step 6: Start canvas server
  if (watch) {
    // In watch mode, start the server without blocking so we can watch for changes
    const server = await startServerNonBlocking(c2dDir, config.port, open, projectRoot);
    const watchDir = project.projectType === 'react-router'
      ? join(projectRoot, 'src')
      : project.appDir!;
    watchAndRerender(projectRoot, watchDir, c2dDir, config, routerType);

    // Keep process alive until Ctrl+C
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        ui.log('\nShutting down...');
        await server.close();
        resolve();
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
  } else {
    await startServer(c2dDir, config.port, open, projectRoot);
  }
}

async function startServer(c2dDir: string, port: number, open: boolean, projectRoot?: string): Promise<void> {
  ui.header('Starting canvas server...');

  // Resolve canvas app directory: find canvas-dist relative to this package
  const canvasDir = await resolveCanvasDir(c2dDir);
  if (!canvasDir) {
    ui.warn('Canvas app not bundled. Using placeholder.');
  }

  const server = await startCanvasServer({
    port,
    canvasDir,
    c2dDir,
    projectRoot,
  });

  ui.success(`Canvas server running at ${server.url}`);
  ui.log('Share this URL with your team for collaborative review');
  ui.log('Press Ctrl+C to stop\n');

  if (open) {
    try {
      const { exec } = await import('node:child_process');
      exec(`open ${server.url}`);
    } catch {
      // Can't open browser — not critical
    }
  }

  // Keep process alive until Ctrl+C
  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      ui.log('\nShutting down...');
      await server.close();
      resolve();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

async function startServerNonBlocking(
  c2dDir: string,
  port: number,
  open: boolean,
  projectRoot?: string,
): Promise<{ url: string; close: () => Promise<void> }> {
  ui.header('Starting canvas server...');

  const canvasDir = await resolveCanvasDir(c2dDir);
  if (!canvasDir) {
    ui.warn('Canvas app not bundled. Using placeholder.');
  }

  const server = await startCanvasServer({
    port,
    canvasDir: canvasDir!,
    c2dDir,
    projectRoot,
  });

  ui.success(`Canvas server running at ${server.url}`);
  ui.log('Share this URL with your team for collaborative review');
  ui.log('Watching for file changes...\n');

  if (open) {
    try {
      const { exec } = await import('node:child_process');
      exec(`open ${server.url}`);
    } catch {
      // Can't open browser — not critical
    }
  }

  return server;
}

/**
 * Find the canvas-dist directory by walking up from the module's location
 * until we find a directory containing canvas-dist/.
 * Works in both npm-installed and monorepo-dev environments.
 */
async function resolveCanvasDir(c2dDir: string): Promise<string> {
  const { fileURLToPath } = await import('node:url');
  const { dirname } = await import('node:path');
  const __filename = fileURLToPath(import.meta.url);

  // Walk up from the current file's directory to find canvas-dist/
  let dir = dirname(__filename);
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'canvas-dist');
    if (existsSync(candidate) && existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
    dir = dirname(dir);
  }

  // Fallback: try monorepo dev location
  const monorepoDev = join(dirname(__filename), '..', '..', '..', '..', 'apps', 'canvas', 'dist');
  if (existsSync(monorepoDev) && existsSync(join(monorepoDev, 'index.html'))) {
    return monorepoDev;
  }

  // Last resort: write placeholder
  const placeholder = join(c2dDir, '_canvas');
  await mkdir(placeholder, { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(placeholder, 'index.html'), `<!DOCTYPE html><html><body>
    <h1>Code to Design</h1>
    <p>Canvas app not built. Run: <code>cd apps/canvas && npx vite build</code></p>
    <p><a href="/api/manifest">View Manifest</a></p>
  </body></html>`);
  return placeholder;
}

/** File extensions to watch for changes. */
const WATCH_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js', '.css']);

/** Directories and patterns to ignore during watch. */
function shouldIgnoreFile(filename: string | null): boolean {
  if (!filename) return true;
  const ignored = ['node_modules', '.next', '.c2d', '.git'];
  if (ignored.some((dir) => filename.includes(dir))) return true;
  const ext = filename.slice(filename.lastIndexOf('.'));
  return !WATCH_EXTENSIONS.has(ext);
}

function watchAndRerender(
  projectRoot: string,
  appDir: string,
  c2dDir: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  routerType?: 'app-router' | 'pages-router' | 'react-router',
): void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let isRendering = false;

  ui.log(`Watching ${appDir} for changes...`);

  fsWatch(appDir, { recursive: true }, (_event, filename) => {
    if (shouldIgnoreFile(filename as string | null)) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (isRendering) return;
      isRendering = true;

      ui.log(`\nFile changed: ${filename}. Re-rendering...`);

      try {
        // Re-discover routes
        const routes = await scanRoutes({ appDir, routerType });
        const filteredRoutes = routes.filter(
          (r) => !config.excludeRoutes.some((pattern: string) => r.urlPath.includes(pattern)),
        );

        // Re-analyze and generate mocks
        const renderTasks: RenderTask[] = [];
        const mockOptions: MockGeneratorOptions = { apiKey: config.apiKey };

        for (const route of filteredRoutes) {
          const analysis = await analyzePage(route, { projectRoot });
          const { configs } = await generateMocks(analysis, mockOptions);
          for (const mockConfig of configs) {
            renderTasks.push({
              route,
              mockConfig,
              authConfig: analysis.authConfig,
            });
          }
        }

        // Clear previous renders
        if (existsSync(join(c2dDir, 'renders'))) {
          await rm(join(c2dDir, 'renders'), { recursive: true });
        }
        await mkdir(c2dDir, { recursive: true });

        // Pre-render
        const { results } = await preRenderPages(renderTasks, {
          projectRoot,
          outputDir: c2dDir,
          devServerUrl: config.devServerUrl,
        });

        const successCount = results.filter((r) => r.success).length;
        ui.success(`Re-render complete. ${successCount} pages updated.`);
      } catch (err: any) {
        ui.error(`Re-render failed: ${err.message || err}`);
      } finally {
        isRendering = false;
      }
    }, 500);
  });
}
