import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { scanRoutes } from '../../discovery/route-scanner.js';

const MINDFOLIO_APP_DIR = '/Users/jaeyeonnoh/monadlabs/repos/mindfolio/frontend/app';

describe.skipIf(!existsSync(MINDFOLIO_APP_DIR))('scanRoutes - mindfolio integration', () => {
  it('should discover all mindfolio routes', async () => {
    const routes = await scanRoutes({ appDir: MINDFOLIO_APP_DIR });
    const paths = routes.map(r => r.urlPath);

    expect(paths).toContain('/');
    expect(paths).toContain('/login');
    expect(paths).toContain('/signup');
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/demo');

    // Dynamic route
    const editorRoute = routes.find(r => r.urlPath.includes('editor'));
    expect(editorRoute).toBeDefined();
    expect(editorRoute!.isDynamic).toBe(true);
    expect(editorRoute!.params[0].name).toBe('reportId');

    console.log('Discovered routes:');
    for (const r of routes) {
      console.log(`  ${r.urlPath}${r.isDynamic ? ' [dynamic]' : ''}`);
    }
    console.log(`Total: ${routes.length} routes`);
  });
});
