export { scanRoutes } from './discovery/route-scanner.js';
export type { RouteInfo, ScanOptions } from './discovery/types.js';

export { analyzePage, analyzeRoutes } from './analysis/code-analyzer.js';
export type { PageAnalysis, AnalyzeOptions, AuthConfig } from './analysis/types.js';

export { generateMocks, generateAllMocks } from './mock/mock-generator.js';
export type { MockConfig, MockResponse, MockGeneratorOptions, StateVariant } from './mock/types.js';

export { preRenderPages } from './render/pre-renderer.js';
export { startDevServer, findFreePort } from './render/dev-server.js';
export { captureInteractions } from './render/interaction-capturer.js';
export { inlineStylesAndCleanup } from './render/style-inliner.js';
export type { InteractionResult } from './render/interaction-capturer.js';
export type { RenderResult, RenderTask, RenderManifest, PreRenderOptions, ViewportConfig } from './render/types.js';
