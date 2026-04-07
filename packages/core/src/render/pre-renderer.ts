import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MockConfig, MockResponse } from '../mock/types.js';
import type { AuthConfig } from '../analysis/types.js';
import type { RouteInfo } from '../discovery/types.js';
import type {
  RenderResult,
  RenderTask,
  RenderManifest,
  ManifestRoute,
  PreRenderOptions,
  ViewportConfig,
} from './types.js';
import { startDevServer, type DevServerHandle } from './dev-server.js';
import { inlineStylesAndCleanup } from './style-inliner.js';
import { captureInteractions, type InteractionResult } from './interaction-capturer.js';
import { matchMockUrl } from './url-matcher.js';

const DEBUG = process.env.C2D_DEBUG === '1';
function debugLog(...args: any[]) { if (DEBUG) console.log('[c2d:debug]', ...args); }

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_PAGE_TIMEOUT = 15000;
const DEFAULT_SETTLE_TIME = 1500;
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/**
 * Build the actual URL path for a route, substituting dynamic params.
 */
function buildUrlPath(route: RouteInfo, mockConfig: MockConfig): string {
  let path = route.urlPath;
  if (route.isDynamic && mockConfig.routeParams) {
    for (const param of route.params) {
      const value = mockConfig.routeParams[param.name] || 'sample-1';
      path = path.replace(`:${param.name}`, value);
      // Also handle catch-all notation
      path = path.replace(`:${param.name}+`, value);
      path = path.replace(`:${param.name}*`, value);
    }
  }
  return path;
}

/**
 * Slugify a URL path for use as a directory name.
 * "/" → "index", "/dashboard" → "dashboard", "/editor/:id" → "editor-_id"
 */
function slugifyRoute(urlPath: string): string {
  if (urlPath === '/') return 'index';
  return urlPath
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/:/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Set up Playwright route interception for a page with the given mock config.
 */
async function setupMockInterception(
  page: Page,
  devServerUrl: string,
  mockConfig: MockConfig,
  authConfig: AuthConfig,
): Promise<{ unmatchedApiUrls: string[] }> {
  // 1. Inject auth cookies if needed
  if (mockConfig.authMock) {
    const cookies = Object.entries(mockConfig.authMock.cookies).map(([name, value]) => ({
      name,
      value,
      domain: new URL(devServerUrl).hostname,
      path: '/',
    }));
    await page.context().addCookies(cookies);
  } else if (authConfig.hasAuth && authConfig.cookieNames.length > 0) {
    // Fallback: inject dummy cookies for detected auth
    const cookies = authConfig.cookieNames.map(name => ({
      name,
      value: 'c2d_mock_token',
      domain: new URL(devServerUrl).hostname,
      path: '/',
    }));
    await page.context().addCookies(cookies);
  }

  debugLog('Auth:', { hasAuth: authConfig.hasAuth, cookieNames: authConfig.cookieNames, usesClientSideAuth: authConfig.hasAuth && authConfig.cookieNames.length === 0 });

  // 2. Inject localStorage for client-side auth (Zustand persist, etc.)
  const usesClientSideAuth = authConfig.hasAuth && authConfig.cookieNames.length === 0;

  if (usesClientSideAuth) {
    const mockUser = JSON.stringify(mockConfig.authMock?.authCheckResponse?.body ?? {
      id: 'mock_user', email: 'demo@c2d.dev', name: 'Demo User',
    });
    const mockToken = 'c2d_mock_jwt_token';

    await page.addInitScript(`
      try {
        var zustandState = {
          state: {
            user: ${mockUser},
            tokens: { access: "${mockToken}", refresh: "${mockToken}" },
            isAuthenticated: true,
            isLoading: false,
          },
          version: 0,
        };
        localStorage.setItem('auth-storage', JSON.stringify(zustandState));
        localStorage.setItem('token', '${mockToken}');
        localStorage.setItem('access_token', '${mockToken}');
      } catch(e) {}
    `);
    debugLog('Injected localStorage auth');
  }

  // 3. Build auth mock response for interception
  const authMockBody = mockConfig.authMock?.authCheckResponse
    ? JSON.stringify(mockConfig.authMock.authCheckResponse.body)
    : JSON.stringify({ id: 'mock_user', email: 'demo@c2d.dev', name: 'Demo User', email_verified: true, avatar_url: null, created_at: '2026-01-01T00:00:00Z' });

  // Common auth check URL patterns to always intercept
  const AUTH_PATTERNS = ['/auth/me', '/auth/session', '/api/auth/me', '/api/user/me', '/api/auth/session'];

  // 3. Intercept API calls
  let matchedCount = 0;
  let unmatchedCount = 0;
  const unmatchedApiUrls: string[] = [];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Always intercept auth check endpoints (common patterns + detected endpoint)
    const isAuthCheck = AUTH_PATTERNS.some(p => url.includes(p))
      || (authConfig.authCheckEndpoint && url.includes(authConfig.authCheckEndpoint));

    if (isAuthCheck) {
      matchedCount++;
      debugLog('Matched (auth):', method, url);
      const status = mockConfig.authMock?.authCheckResponse?.status ?? 200;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: authMockBody,
      });
    }

    // Check API mocks from AI-generated config
    for (const [pattern, mock] of Object.entries(mockConfig.apiMocks)) {
      if (matchMockUrl(url, method, pattern)) {
        matchedCount++;
        debugLog('Matched (mock):', method, url, '→', pattern);
        if (mock.delay) await new Promise(r => setTimeout(r, mock.delay));
        return route.fulfill({
          status: mock.status,
          contentType: 'application/json',
          body: JSON.stringify(mock.body),
        });
      }
    }

    // Track unmatched API calls separately (for diagnostics)
    try {
      const pathname = new URL(url).pathname;
      if (pathname.startsWith('/api/')) {
        unmatchedApiUrls.push(`${method} ${pathname}`);
        debugLog('Unmatched API:', method, url);
      }
    } catch {}

    unmatchedCount++;
    if (unmatchedCount <= 3) debugLog('Unmatched:', url);

    // Pass through all other requests (static assets, etc.)
    return route.continue();
  });

  return { unmatchedApiUrls };
}

/**
 * Render a single page in a specific state and capture HTML + screenshot.
 */
async function renderPage(
  context: BrowserContext,
  devServerUrl: string,
  task: RenderTask,
  outputDir: string,
  options: { pageTimeout: number; settleTime: number; captureInteractionStates?: boolean; maxInteractions?: number },
  viewport?: ViewportConfig,
): Promise<RenderResult> {
  const { route, mockConfig, authConfig } = task;
  const routeSlug = slugifyRoute(route.urlPath);
  const stateDir = join(outputDir, 'renders', routeSlug);
  await mkdir(stateDir, { recursive: true });

  // Include viewport name in file paths to avoid collisions when rendering multiple viewports
  const filePrefix = viewport ? `${mockConfig.stateName}_${viewport.name}` : mockConfig.stateName;
  const htmlRelPath = join('renders', routeSlug, `${filePrefix}.html`);
  const pngRelPath = join('renders', routeSlug, `${filePrefix}.png`);
  const htmlAbsPath = join(outputDir, htmlRelPath);
  const pngAbsPath = join(outputDir, pngRelPath);

  const page = await context.newPage();

  // Override viewport size for this page if a specific viewport was requested
  if (viewport) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
  }

  try {
    const { unmatchedApiUrls } = await setupMockInterception(page, devServerUrl, mockConfig, authConfig);

    const urlPath = buildUrlPath(route, mockConfig);
    const fullUrl = `${devServerUrl}${urlPath}`;

    // Detect if any mock has a delay (for loading state capture)
    const hasDelayedMock = Object.values(mockConfig.apiMocks).some(m => m.delay && m.delay > 0);
    const isLoadingState = mockConfig.stateName.toLowerCase().includes('loading');

    let redirectedTo: string | null = null;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const newUrl = frame.url();
        if (redirectedTo === null && !newUrl.includes(urlPath) && !newUrl.includes('about:blank')) {
          redirectedTo = newUrl;
        }
      }
    });

    // For loading states with delayed mocks, capture earlier (before data loads)
    const waitUntil = (isLoadingState && hasDelayedMock) ? 'domcontentloaded' as const : 'networkidle' as const;
    await page.goto(fullUrl, {
      waitUntil,
      timeout: options.pageTimeout,
    });
    debugLog('Navigated to', fullUrl, `(waitUntil: ${waitUntil})`);

    // If using client-side auth (localStorage), reload so the app reads the injected state
    const usesClientSideAuth = authConfig.hasAuth && authConfig.cookieNames.length === 0;
    if (usesClientSideAuth) {
      await page.reload({ waitUntil, timeout: options.pageTimeout });
      debugLog('Reloaded for client-side auth');
    }

    // Settle time: shorter for loading states to capture the loading UI
    const actualSettleTime = (isLoadingState && hasDelayedMock) ? 300 : options.settleTime;
    await page.waitForTimeout(actualSettleTime);
    debugLog('Settled for', actualSettleTime, 'ms', isLoadingState ? '(loading state)' : '');

    if (redirectedTo) {
      debugLog('Page redirected from', urlPath, 'to', redirectedTo);
      const html = await page.content();
      await writeFile(htmlAbsPath, html, 'utf-8');
      return {
        route, stateName: mockConfig.stateName,
        htmlPath: htmlRelPath, screenshotPath: pngRelPath,
        success: false,
        error: `Page redirected to ${redirectedTo}`,
        viewportName: viewport?.name,
      };
    }

    // Check for client-side application errors in target app
    const bodyText = await page.evaluate('document.body?.innerText?.substring(0, 200) || ""');
    if (typeof bodyText === 'string' && bodyText.includes('Application error')) {
      debugLog('Target app has client-side error at', urlPath);
      // Still capture the HTML but mark as error
      const html = await page.content();
      await writeFile(htmlAbsPath, html, 'utf-8');
      return {
        route, stateName: mockConfig.stateName,
        htmlPath: htmlRelPath, screenshotPath: pngRelPath,
        success: false,
        error: 'Target app client-side error. The app itself has a bug (check browser console).',
        viewportName: viewport?.name,
      };
    }

    // Inline all external stylesheets so HTML is self-contained
    await inlineStylesAndCleanup(page);

    // Capture HTML
    const html = await page.content();
    await writeFile(htmlAbsPath, html, 'utf-8');
    debugLog('Captured', htmlAbsPath, html.length, 'bytes');

    // Warn about unmatched API calls
    if (unmatchedApiUrls.length > 0) {
      debugLog('⚠ Unmatched API calls for', urlPath, ':', unmatchedApiUrls.join(', '));
    }

    // Capture screenshot
    await page.screenshot({ path: pngAbsPath, fullPage: true });

    // Capture interaction variants (only for success/empty states, not error/loading)
    const interactionStates = ['success', 'empty'];
    const shouldCapture = options.captureInteractionStates !== false
      && interactionStates.includes(mockConfig.stateName);

    let interactions: Array<{ description: string; htmlPath: string }> | undefined;

    if (shouldCapture) {
      // Reload before interaction capture to get a clean page with scripts intact
      await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: options.pageTimeout });
      await page.waitForTimeout(options.settleTime);

      const interactionResults = await captureInteractions(
        page,
        fullUrl,
        route,
        mockConfig.stateName,
        outputDir,
        { maxInteractions: options.maxInteractions, settleTime: 500 },
      );

      const successful = interactionResults.filter(r => r.success);
      if (successful.length > 0) {
        interactions = successful.map(r => ({
          description: r.elementDescription,
          htmlPath: r.htmlPath,
        }));
      }
    }

    return {
      route,
      stateName: mockConfig.stateName,
      htmlPath: htmlRelPath,
      screenshotPath: pngRelPath,
      success: true,
      viewportName: viewport?.name,
      interactions,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Write an error placeholder HTML
    const errorHtml = `<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;">
      <div style="text-align:center"><h2>Render Failed</h2><p>${route.urlPath} [${mockConfig.stateName}]</p><pre style="color:#c00">${errorMsg}</pre></div>
    </body></html>`;
    await writeFile(htmlAbsPath, errorHtml, 'utf-8').catch(() => {});

    return {
      route,
      stateName: mockConfig.stateName,
      htmlPath: htmlRelPath,
      screenshotPath: pngRelPath,
      success: false,
      error: errorMsg,
      viewportName: viewport?.name,
    };
  } finally {
    await page.close();
  }
}

/**
 * Process render tasks with limited concurrency.
 */
async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<RenderResult>,
  onProgress?: (completed: number, total: number, result: RenderResult) => void,
): Promise<RenderResult[]> {
  const results: RenderResult[] = [];
  const queue = [...items];
  const total = items.length;
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const result = await fn(item);
      results.push(result);
      completed++;
      onProgress?.(completed, total, result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Build the render manifest from results.
 */
function buildManifest(
  results: RenderResult[],
  projectName: string,
  viewports?: ViewportConfig[],
): RenderManifest {
  const routeMap = new Map<string, ManifestRoute>();

  // Build a lookup for viewport widths by name
  const viewportWidthMap = new Map<string, number>();
  if (viewports) {
    for (const vp of viewports) {
      viewportWidthMap.set(vp.name, vp.width);
    }
  }

  for (const result of results) {
    const key = result.route.urlPath;
    if (!routeMap.has(key)) {
      routeMap.set(key, {
        urlPath: result.route.urlPath,
        filePath: result.route.filePath,
        states: [],
      });
    }
    routeMap.get(key)!.states.push({
      name: result.viewportName
        ? `${result.stateName} (${result.viewportName})`
        : result.stateName,
      htmlPath: result.htmlPath,
      screenshotPath: result.screenshotPath,
      status: result.success ? 'ok' : 'error',
      error: result.error,
      viewport: result.viewportName,
      viewportWidth: result.viewportName
        ? viewportWidthMap.get(result.viewportName)
        : undefined,
      interactions: result.interactions,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    projectName,
    routes: [...routeMap.values()].sort((a, b) => a.urlPath.localeCompare(b.urlPath)),
  };
}

/**
 * Pre-render all pages with their mock configurations.
 *
 * This is the main entry point for the rendering pipeline:
 * 1. Start dev server (or use provided URL)
 * 2. Launch Playwright browser
 * 3. For each (route, state) pair: intercept APIs, navigate, capture
 * 4. Write manifest.json
 * 5. Clean up
 */
export async function preRenderPages(
  tasks: RenderTask[],
  options: PreRenderOptions,
): Promise<{ results: RenderResult[]; manifest: RenderManifest }> {
  const {
    projectRoot,
    outputDir = join(projectRoot, '.c2d'),
    concurrency = DEFAULT_CONCURRENCY,
    pageTimeout = DEFAULT_PAGE_TIMEOUT,
    settleTime = DEFAULT_SETTLE_TIME,
    viewportWidth = DEFAULT_VIEWPORT.width,
    viewportHeight = DEFAULT_VIEWPORT.height,
    captureInteractions: captureInteractionStates = true,
    maxInteractions,
  } = options;

  // Resolve viewports: if explicit viewports array is provided use it,
  // otherwise fall back to the single viewport from viewportWidth/Height
  // (which themselves default to 1440x900).
  const viewports: ViewportConfig[] | undefined = options.viewports;
  const useMultiViewport = viewports && viewports.length > 0;

  // Create output directory
  await mkdir(outputDir, { recursive: true });

  // Start dev server
  let devServer: DevServerHandle | null = null;
  try {
    devServer = await startDevServer(projectRoot, {
      port: options.devServerPort,
      devServerUrl: options.devServerUrl,
    });

    // Launch browser
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
    });

    try {
      let results: RenderResult[];

      if (useMultiViewport) {
        // Expand tasks: each original task is rendered at each viewport
        const expandedItems: Array<{ task: RenderTask; viewport: ViewportConfig }> = [];
        for (const task of tasks) {
          for (const vp of viewports) {
            expandedItems.push({ task, viewport: vp });
          }
        }

        results = await processWithConcurrency(
          expandedItems,
          concurrency,
          ({ task, viewport: vp }) =>
            renderPage(context, devServer!.url, task, outputDir, { pageTimeout, settleTime, captureInteractionStates, maxInteractions }, vp),
          options.onProgress,
        );
      } else {
        // Single viewport — backward-compatible path (no viewportName in results)
        results = await processWithConcurrency(
          tasks,
          concurrency,
          (task) => renderPage(context, devServer!.url, task, outputDir, { pageTimeout, settleTime, captureInteractionStates, maxInteractions }),
          options.onProgress,
        );
      }

      // Read project name from package.json
      let projectName = 'unknown';
      try {
        const pkg = await import(join(projectRoot, 'package.json'), { with: { type: 'json' } });
        projectName = pkg.default?.name || 'unknown';
      } catch {
        // Can't read package.json — use fallback
      }

      // Build and write manifest
      const manifest = buildManifest(
        results,
        projectName,
        useMultiViewport ? viewports : undefined,
      );
      await writeFile(
        join(outputDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8',
      );

      return { results, manifest };
    } finally {
      await context.close();
      await browser.close();
    }
  } finally {
    if (devServer) {
      await devServer.stop();
    }
  }
}
