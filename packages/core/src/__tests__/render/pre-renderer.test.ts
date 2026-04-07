import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { preRenderPages } from '../../render/pre-renderer.js';
import type { RenderTask } from '../../render/types.js';
import type { RouteInfo } from '../../discovery/types.js';

// ==========================================================================
// Integration test against mindfolio (requires dev server)
// ==========================================================================

const MINDFOLIO_ROOT = '/Users/jaeyeonnoh/monadlabs/repos/mindfolio/frontend';
const MINDFOLIO_APP = join(MINDFOLIO_ROOT, 'app');

describe.skipIf(!existsSync(MINDFOLIO_APP))('preRenderPages - mindfolio integration', () => {
  let outputDir: string;

  it('should render dashboard in success and empty states', async () => {
    outputDir = join(tmpdir(), `vibecanvas-render-test-${Date.now()}`);
    await mkdir(outputDir, { recursive: true });

    const dashboardRoute: RouteInfo = {
      urlPath: '/dashboard',
      filePath: join(MINDFOLIO_APP, 'dashboard/page.tsx'),
      params: [],
      isDynamic: false,
    };

    const tasks: RenderTask[] = [
      {
        route: dashboardRoute,
        mockConfig: {
          stateName: 'success',
          apiMocks: {
            'GET /reports': {
              status: 200,
              body: {
                reports: [
                  {
                    id: 'rpt_1',
                    user_id: 'usr_1',
                    ticker: 'AAPL',
                    company_name: 'Apple Inc.',
                    title: 'Apple Investment Thesis',
                    content: '<p>Test content</p>',
                    key_points: 'Test key points',
                    status: 'draft',
                    word_count: 1000,
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-01T00:00:00Z',
                  },
                ],
                total: 1,
                page: 1,
                limit: 20,
                total_pages: 1,
              },
            },
          },
          authMock: {
            cookies: { access_token: 'mock_token_vibecanvas' },
            authCheckResponse: {
              status: 200,
              body: { id: 'usr_1', email: 'demo@vibecanvas.dev', name: 'Demo User', email_verified: true, avatar_url: null, created_at: '2026-01-01T00:00:00Z' },
            },
          },
        },
        authConfig: {
          hasAuth: true,
          cookieNames: ['access_token'],
          authCheckEndpoint: '/auth/me',
          apiBaseUrl: 'http://localhost:8000/api',
        },
      },
      {
        route: dashboardRoute,
        mockConfig: {
          stateName: 'empty',
          apiMocks: {
            'GET /reports': {
              status: 200,
              body: { reports: [], total: 0, page: 1, limit: 20, total_pages: 0 },
            },
          },
          authMock: {
            cookies: { access_token: 'mock_token_vibecanvas' },
            authCheckResponse: {
              status: 200,
              body: { id: 'usr_1', email: 'demo@vibecanvas.dev', name: 'Demo User', email_verified: true, avatar_url: null, created_at: '2026-01-01T00:00:00Z' },
            },
          },
        },
        authConfig: {
          hasAuth: true,
          cookieNames: ['access_token'],
          authCheckEndpoint: '/auth/me',
          apiBaseUrl: 'http://localhost:8000/api',
        },
      },
    ];

    const { results, manifest } = await preRenderPages(tasks, {
      projectRoot: MINDFOLIO_ROOT,
      outputDir,
      settleTime: 2000,
    });

    // Both renders should succeed
    expect(results).toHaveLength(2);

    const successResult = results.find(r => r.stateName === 'success');
    const emptyResult = results.find(r => r.stateName === 'empty');

    expect(successResult).toBeDefined();
    expect(successResult!.success).toBe(true);
    expect(emptyResult).toBeDefined();
    expect(emptyResult!.success).toBe(true);

    // HTML files should exist and contain content
    const successHtml = await readFile(join(outputDir, successResult!.htmlPath), 'utf-8');
    expect(successHtml.length).toBeGreaterThan(1000);
    expect(successHtml).toContain('Apple'); // Mock data should be rendered

    const emptyHtml = await readFile(join(outputDir, emptyResult!.htmlPath), 'utf-8');
    expect(emptyHtml.length).toBeGreaterThan(1000);

    // Screenshots should exist
    expect(existsSync(join(outputDir, successResult!.screenshotPath))).toBe(true);
    expect(existsSync(join(outputDir, emptyResult!.screenshotPath))).toBe(true);

    // Manifest should be written
    const manifestPath = join(outputDir, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifestContent = JSON.parse(await readFile(manifestPath, 'utf-8'));
    expect(manifestContent.routes).toHaveLength(1);
    expect(manifestContent.routes[0].urlPath).toBe('/dashboard');
    expect(manifestContent.routes[0].states).toHaveLength(2);

    console.log('Render results:');
    for (const r of results) {
      console.log(`  ${r.success ? '✓' : '✗'} ${r.route.urlPath} [${r.stateName}] → ${r.htmlPath}`);
    }
    console.log(`Manifest: ${manifestContent.routes.length} routes`);

    // Cleanup
    await rm(outputDir, { recursive: true, force: true });
  }, 120000); // 2 minute timeout for dev server start + rendering
});
