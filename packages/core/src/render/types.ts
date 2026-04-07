import type { MockConfig } from '../mock/types.js';
import type { RouteInfo } from '../discovery/types.js';
import type { AuthConfig } from '../analysis/types.js';

/**
 * A viewport configuration for multi-view rendering.
 */
export interface ViewportConfig {
  /** Human-readable name (e.g. 'desktop', 'mobile') */
  name: string;
  /** Viewport width in pixels */
  width: number;
  /** Viewport height in pixels */
  height: number;
}

/**
 * Result of rendering a single page in a specific state.
 */
export interface RenderResult {
  /** The route that was rendered */
  route: RouteInfo;
  /** The state variant name */
  stateName: string;
  /** Path to the captured HTML file (relative to output dir) */
  htmlPath: string;
  /** Path to the captured screenshot (relative to output dir) */
  screenshotPath: string;
  /** Whether rendering succeeded */
  success: boolean;
  /** Error message if rendering failed */
  error?: string;
  /** The viewport name used for this render (e.g. 'desktop') */
  viewportName?: string;
  /** Interaction variants captured by clicking UI elements */
  interactions?: Array<{
    description: string;
    htmlPath: string;
  }>;
}

/**
 * A render task — a (route, mockConfig) pair to render.
 */
export interface RenderTask {
  route: RouteInfo;
  mockConfig: MockConfig;
  authConfig: AuthConfig;
}

/**
 * The render manifest written to .c2d/manifest.json.
 */
export interface RenderManifest {
  generatedAt: string;
  projectName: string;
  routes: ManifestRoute[];
}

export interface ManifestRoute {
  urlPath: string;
  filePath: string;
  states: ManifestState[];
}

export interface ManifestState {
  name: string;
  htmlPath: string;
  screenshotPath: string;
  status: 'ok' | 'error';
  error?: string;
  /** Viewport name if multi-view rendering was used */
  viewport?: string;
  /** Viewport width in pixels */
  viewportWidth?: number;
  /** Interaction variants captured by clicking UI elements */
  interactions?: Array<{
    description: string;
    htmlPath: string;
  }>;
}

/**
 * Options for the pre-renderer.
 */
export interface PreRenderOptions {
  /** Absolute path to the project root */
  projectRoot: string;
  /** Output directory for rendered files (default: .c2d in projectRoot) */
  outputDir?: string;
  /** Dev server URL if already running (skips auto-start) */
  devServerUrl?: string;
  /** Port for auto-started dev server (default: auto-detect free port) */
  devServerPort?: number;
  /** Maximum concurrent Playwright pages (default: 3) */
  concurrency?: number;
  /** Timeout per page render in ms (default: 15000) */
  pageTimeout?: number;
  /** Additional settle time after networkidle in ms (default: 1500) */
  settleTime?: number;
  /** Viewport width (default: 1440) — used when viewports is not provided */
  viewportWidth?: number;
  /** Viewport height (default: 900) — used when viewports is not provided */
  viewportHeight?: number;
  /** Multiple viewports to render each page at (default: single desktop 1440x900) */
  viewports?: ViewportConfig[];
  /** Progress callback called after each page render completes */
  onProgress?: (completed: number, total: number, result: RenderResult) => void;
  /** Whether to capture interaction states by clicking UI elements (default: true) */
  captureInteractions?: boolean;
  /** Maximum number of interactions to capture per page (default: 5) */
  maxInteractions?: number;
}
