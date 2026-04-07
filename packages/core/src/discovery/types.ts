/**
 * Information about a discovered route.
 */
export interface RouteInfo {
  /** The URL path for this route (e.g., "/dashboard", "/blog/:slug") */
  urlPath: string;
  /** Absolute filesystem path to the page file */
  filePath: string;
  /** Dynamic route parameters, if any */
  params: RouteParam[];
  /** Whether this route contains dynamic segments */
  isDynamic: boolean;
}

/**
 * A dynamic parameter in a route.
 */
export interface RouteParam {
  /** Parameter name (e.g., "slug", "id") */
  name: string;
  /** Whether this is a catch-all parameter ([...slug]) */
  isCatchAll: boolean;
  /** Whether this is an optional catch-all parameter ([[...slug]]) */
  isOptional: boolean;
}

/**
 * Options for the route scanner.
 */
export interface ScanOptions {
  /** Absolute path to the project's app/ directory (for Next.js) or project root (for React Router) */
  appDir: string;
  /** Router type to use. Defaults to 'auto' (auto-detect based on directory name and project structure). */
  routerType?: 'app-router' | 'pages-router' | 'react-router' | 'auto';
}
