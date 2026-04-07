import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { RouteInfo, RouteParam, ScanOptions } from './types.js';

const PAGE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const PAGE_BASENAMES = new Set(['page']);

/** Files that should be skipped in Pages Router (special Next.js files). */
const PAGES_ROUTER_SKIP = new Set(['_app', '_document', '_error']);

/**
 * Check if a filename is an App Router page file (page.tsx, page.js, etc.)
 */
function isPageFile(filename: string): boolean {
  const ext = extname(filename);
  const basename = filename.slice(0, -ext.length);
  return PAGE_EXTENSIONS.has(ext) && PAGE_BASENAMES.has(basename);
}

/**
 * Check if a filename is a valid Pages Router page file.
 * Skips files starting with `_` and non-page extensions.
 */
function isPagesRouterFile(filename: string): boolean {
  const ext = extname(filename);
  if (!PAGE_EXTENSIONS.has(ext)) return false;
  const basename = filename.slice(0, -ext.length);
  if (basename.startsWith('_')) return false;
  return true;
}

/**
 * Check if a directory should be skipped entirely.
 */
function shouldSkipDir(name: string): boolean {
  // Private folders
  if (name.startsWith('_')) return true;
  // Parallel route slots
  if (name.startsWith('@')) return true;
  // Intercepting routes
  if (name.startsWith('(.)') || name.startsWith('(..)')) return true;
  // Build artifacts and dependencies
  if (name === 'node_modules' || name === '.next') return true;
  return false;
}

/**
 * Check if a directory is a route group (parenthesized name like "(auth)").
 * Route groups are stripped from the URL but recursed into.
 */
function isRouteGroup(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')') && !name.startsWith('(.');
}

/**
 * Parse a dynamic route segment and extract parameter info.
 * Returns null if the segment is not dynamic.
 */
function parseDynamicSegment(segment: string): RouteParam | null {
  // Optional catch-all: [[...param]]
  const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
  if (optionalCatchAll) {
    return { name: optionalCatchAll[1], isCatchAll: true, isOptional: true };
  }

  // Required catch-all: [...param]
  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
  if (catchAll) {
    return { name: catchAll[1], isCatchAll: true, isOptional: false };
  }

  // Single dynamic: [param]
  const dynamic = segment.match(/^\[(.+)\]$/);
  if (dynamic) {
    return { name: dynamic[1], isCatchAll: false, isOptional: false };
  }

  return null;
}

/**
 * Convert a dynamic segment to a URL-friendly representation.
 */
function segmentToUrlPart(segment: string): string {
  const param = parseDynamicSegment(segment);
  if (!param) return segment;

  if (param.isCatchAll && param.isOptional) return `:${param.name}*`;
  if (param.isCatchAll) return `:${param.name}+`;
  return `:${param.name}`;
}

/**
 * Recursively scan a directory for Next.js App Router page files.
 */
async function scanDir(
  dirPath: string,
  urlSegments: string[],
  params: RouteParam[],
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];

  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return routes;
  }

  for (const entry of entries) {
    const entryPath = join(dirPath, entry);
    const entryStat = await stat(entryPath).catch(() => null);
    if (!entryStat) continue;

    if (entryStat.isFile() && isPageFile(entry)) {
      const urlPath = '/' + urlSegments.join('/');
      routes.push({
        urlPath: urlPath || '/',
        filePath: entryPath,
        params: [...params],
        isDynamic: params.length > 0,
      });
    }

    if (entryStat.isDirectory()) {
      if (shouldSkipDir(entry)) continue;

      if (isRouteGroup(entry)) {
        // Route groups: recurse but don't add to URL
        const nested = await scanDir(entryPath, urlSegments, params);
        routes.push(...nested);
      } else {
        // Regular or dynamic segment
        const param = parseDynamicSegment(entry);
        const urlPart = segmentToUrlPart(entry);
        const newParams = param ? [...params, param] : params;
        const nested = await scanDir(entryPath, [...urlSegments, urlPart], newParams);
        routes.push(...nested);
      }
    }
  }

  return routes;
}

/**
 * Recursively scan a Pages Router `pages/` directory for page files.
 *
 * Pages Router conventions:
 * - Any .tsx/.ts/.jsx/.js file is a route (not just `page.*`)
 * - `index.tsx` maps to the directory root
 * - `_app`, `_document`, `_error` are skipped
 * - Files starting with `_` are skipped
 * - `api/` directory is skipped (API routes)
 */
async function scanPagesDir(
  dirPath: string,
  urlSegments: string[],
  params: RouteParam[],
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];

  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return routes;
  }

  for (const entry of entries) {
    const entryPath = join(dirPath, entry);
    const entryStat = await stat(entryPath).catch(() => null);
    if (!entryStat) continue;

    if (entryStat.isFile() && isPagesRouterFile(entry)) {
      const ext = extname(entry);
      const basename = entry.slice(0, -ext.length);

      // Convert filename to URL segment
      let fileUrlSegments: string[];
      let fileParams: RouteParam[];

      if (basename === 'index') {
        // index.tsx → use current directory path
        fileUrlSegments = urlSegments;
        fileParams = params;
      } else {
        const param = parseDynamicSegment(basename);
        const urlPart = segmentToUrlPart(basename);
        fileUrlSegments = [...urlSegments, urlPart];
        fileParams = param ? [...params, param] : params;
      }

      const urlPath = '/' + fileUrlSegments.join('/');
      routes.push({
        urlPath: urlPath || '/',
        filePath: entryPath,
        params: [...fileParams],
        isDynamic: fileParams.length > 0,
      });
    }

    if (entryStat.isDirectory()) {
      // Skip api/ directory and hidden/private directories
      if (entry === 'api') continue;
      if (entry.startsWith('_')) continue;
      if (entry === 'node_modules' || entry === '.next') continue;

      const param = parseDynamicSegment(entry);
      const urlPart = segmentToUrlPart(entry);
      const newParams = param ? [...params, param] : params;
      const nested = await scanPagesDir(entryPath, [...urlSegments, urlPart], newParams);
      routes.push(...nested);
    }
  }

  return routes;
}

/**
 * Parse a React Router `:param` dynamic segment into a RouteParam.
 */
function parseReactRouterParam(segment: string): RouteParam | null {
  if (!segment.startsWith(':')) return null;
  return { name: segment.slice(1), isCatchAll: false, isOptional: false };
}

/**
 * Recursively find files under `dir` that have one of the given extensions.
 */
async function findFiles(dir: string, extensions: Set<string>): Promise<string[]> {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') continue;
      results.push(...(await findFiles(full, extensions)));
    } else if (extensions.has(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Check if a project at the given root uses react-router-dom.
 */
async function hasReactRouter(projectRoot: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return 'react-router-dom' in deps || 'react-router' in deps;
  } catch {
    return false;
  }
}

/**
 * Extract route paths from a source file that uses react-router-dom.
 *
 * This is a best-effort regex-based approach. It handles:
 * - JSX: `<Route path="/about" ...`
 * - Object config: `{ path: "/about" ...` or `{ path: '/about' ...`
 * - createBrowserRouter / createRoutesFromElements patterns
 */
function extractRoutePathsFromSource(source: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  // Pattern 1: <Route path="..." or <Route path='...'
  const jsxPattern = /<Route\s[^>]*?path\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = jsxPattern.exec(source)) !== null) {
    const p = match[1];
    if (p !== '*' && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  }

  // Pattern 2: { path: "..." } or { path: '...' } in route config objects
  const objPattern = /path\s*:\s*["']([^"']+)["']/g;
  while ((match = objPattern.exec(source)) !== null) {
    const p = match[1];
    if (p !== '*' && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  }

  return paths;
}

/**
 * Scan a React Router project and extract route definitions from source code.
 *
 * This is inherently imprecise since React Router uses code-based routing.
 * The scanner finds files that import from `react-router-dom` and contain
 * route definitions, then extracts paths using regex.
 */
async function scanReactRouter(projectRoot: string): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const seen = new Set<string>();

  // Find candidate source files under src/ (or project root if no src/)
  const srcDir = join(projectRoot, 'src');
  const scanRoot = await stat(srcDir).then(() => srcDir).catch(() => projectRoot);
  const files = await findFiles(scanRoot, PAGE_EXTENSIONS);

  for (const filePath of files) {
    let source: string;
    try {
      source = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Only process files that import from react-router-dom / react-router
    if (
      !source.includes('react-router-dom') &&
      !source.includes('react-router')
    ) {
      continue;
    }

    // Check for Route or createBrowserRouter usage
    if (
      !source.includes('Route') &&
      !source.includes('createBrowserRouter') &&
      !source.includes('createRoutesFromElements') &&
      !source.match(/path\s*:\s*["']/)
    ) {
      continue;
    }

    const extractedPaths = extractRoutePathsFromSource(source);

    for (const routePath of extractedPaths) {
      if (seen.has(routePath)) continue;
      seen.add(routePath);

      // Parse dynamic segments (:param)
      const segments = routePath.split('/').filter(Boolean);
      const params: RouteParam[] = [];
      for (const seg of segments) {
        const param = parseReactRouterParam(seg);
        if (param) params.push(param);
      }

      // Normalize path — ensure leading slash
      const urlPath = routePath.startsWith('/') ? routePath : '/' + routePath;

      routes.push({
        urlPath,
        filePath,
        params,
        isDynamic: params.length > 0,
      });
    }
  }

  return routes;
}

/**
 * Scan a project directory and extract all renderable routes.
 *
 * Supports Next.js App Router, Pages Router, and React Router (Vite):
 * - App Router: page.{js,jsx,ts,tsx} files, route groups, parallel routes, etc.
 * - Pages Router: any .tsx/.ts/.jsx/.js file (except _app, _document, _error, api/)
 * - React Router: regex-based extraction from source files importing react-router-dom
 *
 * For Next.js, `appDir` should point to the `app/` or `pages/` directory.
 * For React Router, `appDir` should point to the project root.
 * The scanner auto-detects which router convention to use based on `routerType`
 * (default 'auto' detects from directory name and project structure).
 */
export async function scanRoutes(options: ScanOptions): Promise<RouteInfo[]> {
  const { appDir, routerType = 'auto' } = options;

  // React Router: explicit or auto-detected
  if (routerType === 'react-router') {
    const routes = await scanReactRouter(appDir);
    routes.sort((a, b) => a.urlPath.localeCompare(b.urlPath));
    return routes;
  }

  if (routerType === 'auto') {
    // Check if this looks like a React Router project (has package.json with react-router-dom)
    const isReactRouter = await hasReactRouter(appDir);
    if (isReactRouter) {
      const routes = await scanReactRouter(appDir);
      routes.sort((a, b) => a.urlPath.localeCompare(b.urlPath));
      return routes;
    }
  }

  const dirStat = await stat(appDir).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) {
    throw new Error(`App directory not found: ${appDir}`);
  }

  // Detect if this is a Pages Router directory
  const dirName = appDir.replace(/\/$/, '').split('/').pop();
  const isPagesRouter = routerType === 'pages-router' || (routerType === 'auto' && dirName === 'pages');

  const routes = isPagesRouter
    ? await scanPagesDir(appDir, [], [])
    : await scanDir(appDir, [], []);

  // Sort routes for consistent output
  routes.sort((a, b) => a.urlPath.localeCompare(b.urlPath));

  return routes;
}
