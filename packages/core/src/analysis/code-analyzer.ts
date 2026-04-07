import { readFile } from 'node:fs/promises';
import { join, dirname, resolve, extname } from 'node:path';
import { existsSync } from 'node:fs';
import type { RouteInfo } from '../discovery/types.js';
import type { PageAnalysis, AnalyzeOptions, ExtractedEndpoint } from './types.js';
import { detectAuth } from './auth-detector.js';
import { extractEndpoints, extractBaseUrl } from './endpoint-extractor.js';

const DEFAULT_MAX_TOKENS = 8000;
const CHARS_PER_TOKEN = 4; // rough approximation

/**
 * Extract import paths from TypeScript/JavaScript source code.
 * Uses regex — does not handle barrel exports or re-exports.
 */
function extractImportPaths(source: string): string[] {
  const paths: string[] = [];
  // Match: import ... from '...'  and  import '...'
  const regex = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

/**
 * Resolve tsconfig path aliases (e.g., @/lib/api → /absolute/path/lib/api).
 * Returns an absolute path when aliases contain absolute base paths.
 */
function resolvePathAlias(
  importPath: string,
  aliases: Record<string, string>,
): string | null {
  for (const [pattern, replacement] of Object.entries(aliases)) {
    const prefix = pattern.replace(/\*$/, '');
    if (importPath.startsWith(prefix)) {
      const rest = importPath.slice(prefix.length);
      return replacement.replace(/\*$/, '') + rest;
    }
  }
  return null;
}

/**
 * Read tsconfig.json and extract path aliases.
 */
async function readPathAliases(projectRoot: string): Promise<Record<string, string>> {
  const aliases: Record<string, string> = {};

  for (const filename of ['tsconfig.json', 'jsconfig.json']) {
    const configPath = join(projectRoot, filename);
    if (!existsSync(configPath)) continue;

    try {
      const content = await readFile(configPath, 'utf-8');
      // Strip JSON5-style comments while preserving // inside strings.
      // Match strings first (to skip them), then line & block comments.
      const stripped = content.replace(
        /"(?:[^"\\]|\\.)*"|\/\/.*$|\/\*[\s\S]*?\*\//gm,
        (match) => (match.startsWith('"') ? match : ''),
      );
      const config = JSON.parse(stripped);
      const paths = config.compilerOptions?.paths;
      const baseUrl = config.compilerOptions?.baseUrl || '.';
      const resolvedBaseUrl = resolve(projectRoot, baseUrl);

      if (paths) {
        for (const [key, values] of Object.entries(paths)) {
          const targets = values as string[];
          if (targets.length > 0) {
            // Store as absolute path for reliable resolution
            aliases[key] = join(resolvedBaseUrl, targets[0]);
          }
        }
      }
    } catch {
      // Can't parse tsconfig — skip aliases
    }
  }

  return aliases;
}

/**
 * Try to resolve an import path to an actual file.
 */
function resolveImportToFile(importPath: string, fromDir: string): string | null {
  // Try exact path first, then with extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  const candidates: string[] = [];

  const resolved = resolve(fromDir, importPath);

  // Try exact
  candidates.push(resolved);
  // Try with extensions
  for (const ext of extensions) {
    candidates.push(resolved + ext);
  }
  // Try as directory with index
  for (const ext of extensions) {
    candidates.push(join(resolved, `index${ext}`));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Trace imports from a source file, up to maxDepth levels deep.
 * Returns a map of filePath → source content.
 */
async function traceImports(
  filePath: string,
  projectRoot: string,
  aliases: Record<string, string>,
  maxDepth: number,
  visited: Set<string> = new Set(),
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  if (visited.has(filePath) || maxDepth < 0) return results;
  visited.add(filePath);

  let source: string;
  try {
    source = await readFile(filePath, 'utf-8');
  } catch {
    return results;
  }

  results.set(filePath, source);

  const importPaths = extractImportPaths(source);
  const fileDir = dirname(filePath);

  for (const importPath of importPaths) {
    // Skip node_modules imports
    if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('~/')) {
      // Check if it's a path alias
      const aliasResolved = resolvePathAlias(importPath, aliases);
      if (!aliasResolved) continue;

      const resolved = resolveImportToFile(aliasResolved, projectRoot);
      if (resolved && !visited.has(resolved)) {
        const nested = await traceImports(resolved, projectRoot, aliases, maxDepth - 1, visited);
        for (const [path, content] of nested) {
          results.set(path, content);
        }
      }
    } else if (importPath.startsWith('.')) {
      // Relative import
      const resolved = resolveImportToFile(importPath, fileDir);
      if (resolved && !visited.has(resolved)) {
        const nested = await traceImports(resolved, projectRoot, aliases, maxDepth - 1, visited);
        for (const [path, content] of nested) {
          results.set(path, content);
        }
      }
    } else {
      // Path alias (e.g., @/lib/api-client)
      const aliasResolved = resolvePathAlias(importPath, aliases);
      if (aliasResolved) {
        const resolved = resolveImportToFile(aliasResolved, projectRoot);
        if (resolved && !visited.has(resolved)) {
          const nested = await traceImports(resolved, projectRoot, aliases, maxDepth - 1, visited);
          for (const [path, content] of nested) {
            results.set(path, content);
          }
        }
      }
    }
  }

  return results;
}

/**
 * Estimate token count from a string (rough: ~4 chars per token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Check if source code contains API call patterns.
 */
function hasApiCalls(source: string): boolean {
  return /\bfetch\s*\(/.test(source)
    || /\baxios\b/.test(source)
    || /\buseQuery\b/.test(source)
    || /\buseMutation\b/.test(source)
    || /\bapiRequest\b/.test(source)
    || /\bgetServerSideProps\b/.test(source)
    || /\bgetStaticProps\b/.test(source)
    || /API_BASE_URL/.test(source)
    || /['"]\/api\//.test(source)
    // Detect imports from api/client modules (common naming patterns)
    || /from\s+['"].*api[-_]?client.*['"]/.test(source)
    || /from\s+['"].*\/api['"]/.test(source)
    || /from\s+['"].*\/services\//.test(source);
}

/**
 * Common API client file locations to scan eagerly.
 */
const API_CLIENT_CANDIDATES = [
  'lib/api.ts', 'lib/api.tsx', 'lib/api.js', 'lib/api.jsx',
  'lib/api-client.ts', 'lib/api-client.tsx', 'lib/api-client.js', 'lib/api-client.jsx',
  'src/lib/api.ts', 'src/lib/api.tsx', 'src/lib/api.js', 'src/lib/api.jsx',
  'src/lib/api-client.ts', 'src/lib/api-client.tsx', 'src/lib/api-client.js', 'src/lib/api-client.jsx',
  'services/api.ts', 'services/api.js', 'services/api.tsx', 'services/api.jsx',
  'src/services/api.ts', 'src/services/api.js', 'src/services/api.tsx', 'src/services/api.jsx',
  'utils/api.ts', 'utils/api.js', 'utils/api.tsx', 'utils/api.jsx',
  'src/utils/api.ts', 'src/utils/api.js', 'src/utils/api.tsx', 'src/utils/api.jsx',
];

/**
 * Check if source code contains patterns typical of an API client file.
 */
function hasApiClientPatterns(source: string): boolean {
  return /\.(get|post|put|delete|patch)\s*\(/.test(source)
    || /\bfetch\s*\(/.test(source)
    || /\baxios\b/.test(source)
    || /\bbaseURL\b/.test(source)
    || /\bAPI_URL\b/.test(source);
}

/**
 * Eagerly scan common locations for an API client file.
 * Returns the absolute path and content of the first matching file,
 * or null if none found.
 */
async function findApiClientEagerly(
  projectRoot: string,
  alreadyIncluded: Set<string>,
): Promise<{ path: string; content: string } | null> {
  for (const candidate of API_CLIENT_CANDIDATES) {
    const fullPath = join(projectRoot, candidate);
    if (alreadyIncluded.has(fullPath)) continue;
    if (!existsSync(fullPath)) continue;

    try {
      const content = await readFile(fullPath, 'utf-8');
      if (hasApiClientPatterns(content)) {
        return { path: fullPath, content };
      }
    } catch {
      // Can't read — skip
    }
  }
  return null;
}

/**
 * Analyze a single page: read its source, trace imports, detect auth,
 * and produce a context string suitable for LLM mock generation.
 */
export async function analyzePage(
  route: RouteInfo,
  options: AnalyzeOptions,
): Promise<PageAnalysis> {
  const { projectRoot, maxTokensPerPage = DEFAULT_MAX_TOKENS } = options;
  const maxChars = maxTokensPerPage * CHARS_PER_TOKEN;

  const aliases = await readPathAliases(projectRoot);

  // Trace imports from the page file, up to 2 levels deep
  const tracedFiles = await traceImports(route.filePath, projectRoot, aliases, 2);

  const resolvedImports = [...tracedFiles.keys()].filter(p => p !== route.filePath);
  const allSources = [...tracedFiles.values()];

  // Build the source context with file headers
  let sourceContext = '';
  for (const [filePath, content] of tracedFiles) {
    const relativePath = filePath.startsWith(projectRoot)
      ? filePath.slice(projectRoot.length + 1)
      : filePath;
    const section = `\n// === ${relativePath} ===\n${content}\n`;

    if (sourceContext.length + section.length > maxChars) {
      // Truncation: include just the page file and skip the rest
      break;
    }
    sourceContext += section;
  }

  // Eager scan: find API client files that may not have been imported
  const alreadyIncluded = new Set(tracedFiles.keys());
  let apiClientPath: string | null = null;
  let apiClientSource: string | null = null;

  const eagerResult = await findApiClientEagerly(projectRoot, alreadyIncluded);
  if (eagerResult) {
    apiClientPath = eagerResult.path;
    apiClientSource = eagerResult.content;

    // Add to source context and resolved imports
    const relativePath = eagerResult.path.startsWith(projectRoot)
      ? eagerResult.path.slice(projectRoot.length + 1)
      : eagerResult.path;
    const section = `\n// === ${relativePath} ===\n${eagerResult.content}\n`;

    if (sourceContext.length + section.length <= maxChars) {
      sourceContext += section;
    }

    resolvedImports.push(eagerResult.path);
    allSources.push(eagerResult.content);
  } else {
    // Check if an API client was already found via import tracing
    for (const [filePath, content] of tracedFiles) {
      if (filePath === route.filePath) continue;
      if (hasApiClientPatterns(content)) {
        apiClientPath = filePath;
        apiClientSource = content;
        break;
      }
    }
  }

  // Extract endpoints from API client if found
  let extractedEndpointsList: ExtractedEndpoint[] = [];
  let apiBaseUrl: string | null = null;
  if (apiClientSource) {
    extractedEndpointsList = extractEndpoints(apiClientSource);
    apiBaseUrl = extractBaseUrl(apiClientSource);
  }

  // Detect auth patterns
  const authConfig = await detectAuth(projectRoot, allSources);

  // Check for API dependencies — check both the truncated context and all traced sources
  const combinedSource = allSources.join('\n');
  const hasApi = hasApiCalls(sourceContext) || hasApiCalls(combinedSource);

  // Collect unresolved imports
  const allImportPaths = allSources.flatMap(extractImportPaths);
  const resolvedSet = new Set(resolvedImports.map(p => p));
  const unresolvedImports = allImportPaths
    .filter(p => p.startsWith('.') || p.startsWith('@/') || p.startsWith('~/'))
    .filter(p => {
      // Check if this import was resolved to any file
      const aliasResolved = resolvePathAlias(p, aliases);
      const checkPath = aliasResolved
        ? resolveImportToFile(aliasResolved, projectRoot)
        : resolveImportToFile(p, dirname(route.filePath));
      return !checkPath;
    });

  return {
    route,
    sourceContext,
    resolvedImports,
    unresolvedImports: [...new Set(unresolvedImports)],
    authConfig,
    hasApiDependencies: hasApi,
    estimatedTokens: estimateTokens(sourceContext),
    apiClientPath,
    extractedEndpoints: extractedEndpointsList,
    apiBaseUrl,
  };
}

/**
 * Analyze all discovered routes in a project.
 */
export async function analyzeRoutes(
  routes: RouteInfo[],
  options: AnalyzeOptions,
): Promise<PageAnalysis[]> {
  const results: PageAnalysis[] = [];
  for (const route of routes) {
    const analysis = await analyzePage(route, options);
    results.push(analysis);
  }
  return results;
}
