import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { analyzePage, analyzeRoutes } from '../../analysis/code-analyzer.js';
import type { RouteInfo } from '../../discovery/types.js';

let testDir: string;

async function createFile(relativePath: string, content: string) {
  const fullPath = join(testDir, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content);
}

function makeRoute(urlPath: string, filePath: string): RouteInfo {
  return {
    urlPath,
    filePath: join(testDir, filePath),
    params: [],
    isDynamic: false,
  };
}

beforeEach(async () => {
  testDir = join(tmpdir(), `vibecanvas-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('analyzePage', () => {
  it('should read a simple page with no imports', async () => {
    await createFile('app/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.sourceContext).toContain('Home');
    expect(result.resolvedImports).toHaveLength(0);
    expect(result.hasApiDependencies).toBe(false);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('should trace relative imports', async () => {
    await createFile('app/dashboard/page.tsx', `
      import { Header } from './header';
      export default function Dashboard() { return <Header />; }
    `);
    await createFile('app/dashboard/header.tsx', `
      export function Header() { return <h1>Dashboard</h1>; }
    `);

    const route = makeRoute('/dashboard', 'app/dashboard/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.sourceContext).toContain('Dashboard');
    expect(result.sourceContext).toContain('Header');
    expect(result.resolvedImports.length).toBeGreaterThanOrEqual(1);
  });

  it('should resolve tsconfig path aliases', async () => {
    await createFile('tsconfig.json', JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@/*': ['./src/*'] }
      }
    }));
    await createFile('app/page.tsx', `
      import { api } from '@/lib/api-client';
      export default function Home() { return <div>{api}</div>; }
    `);
    await createFile('src/lib/api-client.ts', `
      export const api = { baseUrl: 'http://localhost:8000/api' };
      export async function getReports() { return fetch(api.baseUrl + '/reports'); }
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.sourceContext).toContain('getReports');
    expect(result.sourceContext).toContain('api-client');
    expect(result.hasApiDependencies).toBe(true);
  });

  it('should detect API dependencies from fetch calls', async () => {
    await createFile('app/page.tsx', `
      export default async function Page() {
        const data = await fetch('/api/data');
        return <div>{JSON.stringify(data)}</div>;
      }
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.hasApiDependencies).toBe(true);
  });

  it('should detect API dependencies from useQuery', async () => {
    await createFile('app/page.tsx', `
      import { useQuery } from '@tanstack/react-query';
      export default function Page() {
        const { data } = useQuery({ queryKey: ['items'] });
        return <div>{data}</div>;
      }
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.hasApiDependencies).toBe(true);
  });

  it('should report no API dependencies for static pages', async () => {
    await createFile('app/about/page.tsx', `
      export default function About() { return <div>About us</div>; }
    `);

    const route = makeRoute('/about', 'app/about/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.hasApiDependencies).toBe(false);
  });

  it('should detect auth from middleware', async () => {
    await createFile('middleware.ts', `
      import { NextResponse } from 'next/server';
      export function middleware(request) {
        const token = request.cookies.get('access_token');
        if (!token) return NextResponse.redirect('/login');
        return NextResponse.next();
      }
    `);
    await createFile('app/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.authConfig.hasAuth).toBe(true);
    expect(result.authConfig.cookieNames).toContain('access_token');
  });

  it('should detect auth from context providers', async () => {
    await createFile('app/page.tsx', `
      import { useAuth } from '@/context/auth-context';
      export default function Page() {
        const { user } = useAuth();
        return <div>{user?.name}</div>;
      }
    `);
    await createFile('tsconfig.json', JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } }
    }));
    await createFile('src/context/auth-context.tsx', `
      export function useAuth() { return { user: null }; }
      export function AuthProvider({ children }) { return children; }
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.authConfig.hasAuth).toBe(true);
  });

  it('should detect auth check endpoint', async () => {
    await createFile('app/page.tsx', `
      import { api } from './api';
      export default function Page() { return <div>Page</div>; }
    `);
    await createFile('app/api.ts', `
      const res = await fetch(baseUrl + '/auth/me', { credentials: 'include' });
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.authConfig.authCheckEndpoint).toBe('/auth/me');
  });

  it('should handle unresolvable imports gracefully', async () => {
    await createFile('app/page.tsx', `
      import { thing } from './nonexistent';
      import { other } from '@/missing/module';
      export default function Page() { return <div>Page</div>; }
    `);
    await createFile('tsconfig.json', JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } }
    }));

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    // Should not throw
    expect(result.sourceContext).toContain('Page');
    expect(result.unresolvedImports.length).toBeGreaterThan(0);
  });

  it('should respect token budget', async () => {
    const bigContent = 'const x = ' + '"a"'.repeat(5000) + ';';
    await createFile('app/page.tsx', `
      import { big } from './big';
      export default function Page() { return <div>Page</div>; }
    `);
    await createFile('app/big.ts', bigContent);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir, maxTokensPerPage: 200 });

    // Should be truncated — page file included but big import may be cut off
    expect(result.estimatedTokens).toBeLessThanOrEqual(250); // some tolerance
  });

  it('should follow imports up to 2 levels deep', async () => {
    await createFile('app/page.tsx', `
      import { Component } from './component';
      export default function Page() { return <Component />; }
    `);
    await createFile('app/component.tsx', `
      import { helper } from './helper';
      export function Component() { return <div>{helper()}</div>; }
    `);
    await createFile('app/helper.ts', `
      import { deep } from './deep';
      export function helper() { return deep(); }
    `);
    await createFile('app/deep.ts', `
      export function deep() { return 'deep value'; }
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    // page (depth 0) → component (depth 1) → helper (depth 2) → deep (depth 3, NOT included)
    expect(result.sourceContext).toContain('Component');
    expect(result.sourceContext).toContain('helper');
    // deep.ts is at depth 3, should NOT be included
    expect(result.sourceContext).not.toContain('deep value');
  });
});

describe('analyzePage - eager API client detection', () => {
  it('should include lib/api.ts even without an import from the page', async () => {
    await createFile('app/page.tsx', `
      export default function Home() { return <div>Home</div>; }
    `);
    await createFile('lib/api.ts', `
      import axios from 'axios';
      const api = axios.create({ baseURL: 'http://localhost:8000' });
      export const getItems = () => api.get('/api/v1/items/');
      export const createItem = (data: any) => api.post('/api/v1/items/', data);
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.sourceContext).toContain('getItems');
    expect(result.sourceContext).toContain('api.ts');
    expect(result.apiClientPath).toBe(join(testDir, 'lib/api.ts'));
  });

  it('should not duplicate an API client already included via import tracing', async () => {
    await createFile('tsconfig.json', JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } }
    }));
    await createFile('app/page.tsx', `
      import { api } from '@/lib/api';
      export default function Home() { return <div>{api}</div>; }
    `);
    await createFile('src/lib/api.ts', `
      import axios from 'axios';
      const api = axios.create({ baseURL: 'http://localhost:8000' });
      export default api;
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    // Should appear only once in source context
    const occurrences = result.sourceContext.split('src/lib/api.ts').length - 1;
    expect(occurrences).toBe(1);
    // apiClientPath should still be detected (from import tracing)
    expect(result.apiClientPath).toBe(join(testDir, 'src/lib/api.ts'));
  });

  it('should find API client at src/lib/api.ts location', async () => {
    await createFile('app/page.tsx', `
      export default function Page() { return <div>Page</div>; }
    `);
    await createFile('src/lib/api.ts', `
      export const fetchData = () => fetch('/api/data');
    `);

    const route = makeRoute('/', 'app/page.tsx');
    const result = await analyzePage(route, { projectRoot: testDir });

    expect(result.sourceContext).toContain('fetchData');
    expect(result.apiClientPath).toBe(join(testDir, 'src/lib/api.ts'));
  });
});

describe('analyzePage - mindfolio integration', () => {
  const MINDFOLIO_ROOT = '/Users/jaeyeonnoh/monadlabs/repos/mindfolio/frontend';
  const MINDFOLIO_APP = join(MINDFOLIO_ROOT, 'app');

  it.skipIf(!existsSync(MINDFOLIO_APP))('should analyze mindfolio dashboard', async () => {
    const route: RouteInfo = {
      urlPath: '/dashboard',
      filePath: join(MINDFOLIO_APP, 'dashboard/page.tsx'),
      params: [],
      isDynamic: false,
    };

    const result = await analyzePage(route, { projectRoot: MINDFOLIO_ROOT });

    // Should have traced into api-client
    expect(result.sourceContext).toContain('getReports');
    expect(result.sourceContext).toContain('deleteReport');
    // Debug output for integration verification
    expect(result.hasApiDependencies).toBe(true);

    // Should detect auth
    expect(result.authConfig.hasAuth).toBe(true);
    expect(result.authConfig.cookieNames).toContain('access_token');

    console.log(`Resolved imports: ${result.resolvedImports.length}`);
    console.log(`Unresolved imports: ${result.unresolvedImports.length}`);
    console.log(`Estimated tokens: ${result.estimatedTokens}`);
    console.log(`Has API deps: ${result.hasApiDependencies}`);
    console.log(`Auth: ${JSON.stringify(result.authConfig, null, 2)}`);
  });
});
