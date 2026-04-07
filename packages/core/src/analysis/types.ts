import type { RouteInfo } from '../discovery/types.js';

/**
 * Auth configuration detected in the target project.
 */
export interface AuthConfig {
  /** Whether auth was detected */
  hasAuth: boolean;
  /** Cookie names used for authentication (e.g., "access_token") */
  cookieNames: string[];
  /** Auth check endpoint path (e.g., "/auth/me") */
  authCheckEndpoint: string | null;
  /** API base URL from environment config */
  apiBaseUrl: string | null;
}

/**
 * An API endpoint extracted from an API client file.
 */
export interface ExtractedEndpoint {
  /** HTTP method (GET, POST, PUT, DELETE, PATCH) */
  method: string;
  /** URL path (e.g., /api/v1/readings/) */
  path: string;
  /** Name of the enclosing function, if detected */
  functionName?: string;
}

/**
 * Complete analysis of a page and its dependencies.
 */
export interface PageAnalysis {
  /** The route this analysis belongs to */
  route: RouteInfo;
  /** Concatenated source code of the page and its traced imports */
  sourceContext: string;
  /** List of imported file paths that were resolved and read */
  resolvedImports: string[];
  /** List of import paths that could not be resolved */
  unresolvedImports: string[];
  /** Auth configuration for the project */
  authConfig: AuthConfig;
  /** Whether this page has API dependencies that need mocking */
  hasApiDependencies: boolean;
  /** Estimated token count for the source context */
  estimatedTokens: number;
  /** Path to the detected API client file (eager scan), or null */
  apiClientPath: string | null;
  /** Endpoints extracted from the API client file */
  extractedEndpoints: ExtractedEndpoint[];
  /** API base URL extracted from the API client file */
  apiBaseUrl: string | null;
}

/**
 * Options for the code analyzer.
 */
export interface AnalyzeOptions {
  /** Absolute path to the project root (where package.json and tsconfig.json live) */
  projectRoot: string;
  /** Maximum tokens per page context (default: 8000) */
  maxTokensPerPage?: number;
}
