import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanRoutes } from '../../discovery/route-scanner.js';
import type { ScanOptions } from '../../discovery/types.js';

let testDir: string;

async function createFile(relativePath: string, content = '') {
  const fullPath = join(testDir, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content);
}

beforeEach(async () => {
  testDir = join(tmpdir(), `vibecanvas-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('scanRoutes', () => {
  it('should find a basic root page', async () => {
    await createFile('app/page.tsx', 'export default function Home() {}');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/');
    expect(routes[0].isDynamic).toBe(false);
    expect(routes[0].params).toEqual([]);
  });

  it('should find nested pages', async () => {
    await createFile('app/page.tsx');
    await createFile('app/dashboard/page.tsx');
    await createFile('app/settings/profile/page.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(3);
    expect(routes.map(r => r.urlPath).sort()).toEqual([
      '/',
      '/dashboard',
      '/settings/profile',
    ]);
  });

  it('should strip route groups from URL', async () => {
    await createFile('app/(auth)/login/page.tsx');
    await createFile('app/(auth)/signup/page.tsx');
    await createFile('app/(marketing)/about/page.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes.map(r => r.urlPath).sort()).toEqual([
      '/about',
      '/login',
      '/signup',
    ]);
  });

  it('should handle dynamic routes', async () => {
    await createFile('app/blog/[slug]/page.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/blog/:slug');
    expect(routes[0].isDynamic).toBe(true);
    expect(routes[0].params).toEqual([
      { name: 'slug', isCatchAll: false, isOptional: false },
    ]);
  });

  it('should handle catch-all routes', async () => {
    await createFile('app/docs/[...slug]/page.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/docs/:slug+');
    expect(routes[0].params[0].isCatchAll).toBe(true);
    expect(routes[0].params[0].isOptional).toBe(false);
  });

  it('should handle optional catch-all routes', async () => {
    await createFile('app/shop/[[...slug]]/page.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/shop/:slug*');
    expect(routes[0].params[0].isCatchAll).toBe(true);
    expect(routes[0].params[0].isOptional).toBe(true);
  });

  it('should skip private folders', async () => {
    await createFile('app/page.tsx');
    await createFile('app/_components/button.tsx');
    await createFile('app/_lib/utils.ts');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/');
  });

  it('should skip parallel route slots', async () => {
    await createFile('app/page.tsx');
    await createFile('app/@modal/login/page.tsx');
    await createFile('app/@sidebar/page.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/');
  });

  it('should skip intercepting routes', async () => {
    await createFile('app/feed/page.tsx');
    await createFile('app/feed/(.)photo/[id]/page.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/feed');
  });

  it('should return empty array for empty app directory', async () => {
    await mkdir(join(testDir, 'app'), { recursive: true });

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(0);
  });

  it('should throw for missing app directory', async () => {
    await expect(
      scanRoutes({ appDir: join(testDir, 'nonexistent') })
    ).rejects.toThrow('App directory not found');
  });

  it('should handle mixed project structure', async () => {
    await createFile('app/page.tsx');
    await createFile('app/(auth)/login/page.tsx');
    await createFile('app/(auth)/signup/page.tsx');
    await createFile('app/dashboard/page.tsx');
    await createFile('app/editor/[reportId]/page.tsx');
    await createFile('app/_components/header.tsx');
    await createFile('app/api/health/route.ts');  // API route, not a page

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    const paths = routes.map(r => r.urlPath).sort();
    expect(paths).toEqual([
      '/',
      '/dashboard',
      '/editor/:reportId',
      '/login',
      '/signup',
    ]);
  });

  it('should support all page file extensions', async () => {
    await createFile('app/a/page.js');
    await createFile('app/b/page.jsx');
    await createFile('app/c/page.ts');
    await createFile('app/d/page.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(4);
  });

  it('should not treat non-page files as routes', async () => {
    await createFile('app/layout.tsx');
    await createFile('app/loading.tsx');
    await createFile('app/error.tsx');
    await createFile('app/not-found.tsx');
    await createFile('app/template.tsx');
    await createFile('app/default.tsx');
    await createFile('app/route.ts');

    const routes = await scanRoutes({ appDir: join(testDir, 'app') });
    expect(routes).toHaveLength(0);
  });
});

describe('scanRoutes — Pages Router', () => {
  it('should find a basic index page', async () => {
    await createFile('pages/index.tsx', 'export default function Home() {}');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/');
    expect(routes[0].isDynamic).toBe(false);
    expect(routes[0].params).toEqual([]);
  });

  it('should find a top-level page file', async () => {
    await createFile('pages/about.tsx', 'export default function About() {}');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/about');
  });

  it('should find nested pages', async () => {
    await createFile('pages/index.tsx');
    await createFile('pages/about.tsx');
    await createFile('pages/blog/index.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(3);
    expect(routes.map(r => r.urlPath).sort()).toEqual([
      '/',
      '/about',
      '/blog',
    ]);
  });

  it('should handle dynamic routes', async () => {
    await createFile('pages/blog/[slug].tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/blog/:slug');
    expect(routes[0].isDynamic).toBe(true);
    expect(routes[0].params).toEqual([
      { name: 'slug', isCatchAll: false, isOptional: false },
    ]);
  });

  it('should handle catch-all routes', async () => {
    await createFile('pages/docs/[...slug].tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/docs/:slug+');
    expect(routes[0].params[0].isCatchAll).toBe(true);
    expect(routes[0].params[0].isOptional).toBe(false);
  });

  it('should handle optional catch-all routes', async () => {
    await createFile('pages/shop/[[...slug]].tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/shop/:slug*');
    expect(routes[0].params[0].isCatchAll).toBe(true);
    expect(routes[0].params[0].isOptional).toBe(true);
  });

  it('should skip _app, _document, _error files', async () => {
    await createFile('pages/index.tsx');
    await createFile('pages/_app.tsx');
    await createFile('pages/_document.tsx');
    await createFile('pages/_error.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/');
  });

  it('should skip api/ directory', async () => {
    await createFile('pages/index.tsx');
    await createFile('pages/api/hello.ts');
    await createFile('pages/api/users/[id].ts');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/');
  });

  it('should handle dynamic directory segments', async () => {
    await createFile('pages/users/[id]/settings.tsx');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/users/:id/settings');
    expect(routes[0].isDynamic).toBe(true);
    expect(routes[0].params).toEqual([
      { name: 'id', isCatchAll: false, isOptional: false },
    ]);
  });

  it('should handle a mixed Pages Router project', async () => {
    await createFile('pages/index.tsx');
    await createFile('pages/about.tsx');
    await createFile('pages/blog/index.tsx');
    await createFile('pages/blog/[slug].tsx');
    await createFile('pages/_app.tsx');
    await createFile('pages/_document.tsx');
    await createFile('pages/api/health.ts');

    const routes = await scanRoutes({ appDir: join(testDir, 'pages') });
    const paths = routes.map(r => r.urlPath).sort();
    expect(paths).toEqual([
      '/',
      '/about',
      '/blog',
      '/blog/:slug',
    ]);
  });
});

describe('scanRoutes — React Router', () => {
  /** Helper to create a React Router project structure. */
  async function setupReactRouterProject(routerFileContent: string) {
    // Create package.json with react-router-dom dependency
    await createFile('package.json', JSON.stringify({
      name: 'test-react-router-app',
      dependencies: {
        'react': '^18.0.0',
        'react-dom': '^18.0.0',
        'react-router-dom': '^6.0.0',
      },
    }));
    // Create the router file under src/
    await createFile('src/router.tsx', routerFileContent);
  }

  it('should extract basic JSX Route paths', async () => {
    await setupReactRouterProject(`
      import { Route, Routes } from 'react-router-dom';
      import Home from './pages/Home';
      import About from './pages/About';

      export default function App() {
        return (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
          </Routes>
        );
      }
    `);

    const routes = await scanRoutes({ appDir: testDir, routerType: 'react-router' });
    const paths = routes.map(r => r.urlPath).sort();
    expect(paths).toEqual(['/', '/about']);
    expect(routes.every(r => !r.isDynamic)).toBe(true);
  });

  it('should extract dynamic :param segments', async () => {
    await setupReactRouterProject(`
      import { Route, Routes } from 'react-router-dom';

      export default function App() {
        return (
          <Routes>
            <Route path="/users/:id" element={<UserProfile />} />
          </Routes>
        );
      }
    `);

    const routes = await scanRoutes({ appDir: testDir, routerType: 'react-router' });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/users/:id');
    expect(routes[0].isDynamic).toBe(true);
    expect(routes[0].params).toEqual([
      { name: 'id', isCatchAll: false, isOptional: false },
    ]);
  });

  it('should extract nested route paths', async () => {
    await setupReactRouterProject(`
      import { Route, Routes } from 'react-router-dom';

      export default function App() {
        return (
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/profile" element={<Profile />} />
            </Route>
          </Routes>
        );
      }
    `);

    const routes = await scanRoutes({ appDir: testDir, routerType: 'react-router' });
    const paths = routes.map(r => r.urlPath).sort();
    expect(paths).toEqual(['/', '/dashboard', '/settings', '/settings/profile']);
  });

  it('should extract routes from createBrowserRouter config', async () => {
    await setupReactRouterProject(`
      import { createBrowserRouter } from 'react-router-dom';

      export const router = createBrowserRouter([
        {
          path: "/",
          element: <Root />,
          children: [
            { path: "/about", element: <About /> },
            { path: "/contact", element: <Contact /> },
            { path: "/blog/:slug", element: <BlogPost /> },
          ],
        },
      ]);
    `);

    const routes = await scanRoutes({ appDir: testDir, routerType: 'react-router' });
    const paths = routes.map(r => r.urlPath).sort();
    expect(paths).toEqual(['/', '/about', '/blog/:slug', '/contact']);
  });

  it('should skip wildcard * routes', async () => {
    await setupReactRouterProject(`
      import { Route, Routes } from 'react-router-dom';

      export default function App() {
        return (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        );
      }
    `);

    const routes = await scanRoutes({ appDir: testDir, routerType: 'react-router' });
    expect(routes).toHaveLength(1);
    expect(routes[0].urlPath).toBe('/');
  });

  it('should return empty array when no routes found', async () => {
    // Create package.json with react-router-dom but no route definitions
    await createFile('package.json', JSON.stringify({
      name: 'test-empty-app',
      dependencies: { 'react-router-dom': '^6.0.0' },
    }));
    await createFile('src/App.tsx', `
      import React from 'react';
      export default function App() { return <div>Hello</div>; }
    `);

    const routes = await scanRoutes({ appDir: testDir, routerType: 'react-router' });
    expect(routes).toHaveLength(0);
  });

  it('should auto-detect react-router from package.json', async () => {
    await setupReactRouterProject(`
      import { Route, Routes } from 'react-router-dom';

      export default function App() {
        return (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
          </Routes>
        );
      }
    `);

    // Use 'auto' routerType (default) — should detect react-router-dom in package.json
    const routes = await scanRoutes({ appDir: testDir });
    const paths = routes.map(r => r.urlPath).sort();
    expect(paths).toEqual(['/', '/about']);
  });

  it('should handle single-quoted paths in config objects', async () => {
    await setupReactRouterProject(`
      import { createBrowserRouter } from 'react-router-dom';

      export const router = createBrowserRouter([
        { path: '/', element: <Root /> },
        { path: '/products', element: <Products /> },
        { path: '/products/:id', element: <ProductDetail /> },
      ]);
    `);

    const routes = await scanRoutes({ appDir: testDir, routerType: 'react-router' });
    const paths = routes.map(r => r.urlPath).sort();
    expect(paths).toEqual(['/', '/products', '/products/:id']);
  });
});
