import type { ExtractedEndpoint } from './types.js';

/**
 * Extract the API base URL from an API client source file.
 * Looks for patterns like:
 *   baseURL: 'http://localhost:8000'
 *   process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
 *   const API_BASE_URL = 'http://...'
 */
export function extractBaseUrl(source: string): string | null {
  // Pattern: process.env.SOMETHING || 'default_url'
  const envFallback = source.match(
    /process\.env\.\w+\s*\|\|\s*['"]([^'"]+)['"]/,
  );
  if (envFallback) return envFallback[1];

  // Pattern: baseURL: 'http://...'
  const baseUrlProp = source.match(/baseURL\s*:\s*['"]([^'"]+)['"]/);
  if (baseUrlProp) return baseUrlProp[1];

  // Pattern: const API_BASE_URL = 'http://...' (or similar names)
  const constAssign = source.match(
    /(?:API_BASE_URL|API_URL|BASE_URL)\s*=\s*['"]([^'"]+)['"]/,
  );
  if (constAssign) return constAssign[1];

  return null;
}

/**
 * Extract HTTP endpoint definitions from an API client source file.
 *
 * Recognises patterns like:
 *   api.get('/path')
 *   axios.post('/path', data)
 *   api.delete(`/items/${id}`)
 *   fetch('/api/items')
 */
export function extractEndpoints(apiClientSource: string): ExtractedEndpoint[] {
  const endpoints: ExtractedEndpoint[] = [];
  const seen = new Set<string>();

  const lines = apiClientSource.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 1: something.get|post|put|delete|patch('/path...')
    // Matches both regular strings and template literals
    const methodCallRegex =
      /\.\s*(get|post|put|delete|patch)\s*\(\s*(?:['"`])([^'"`$]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = methodCallRegex.exec(line)) !== null) {
      const method = match[1].toUpperCase();
      let path = match[2];

      // Clean up path — remove trailing quote chars if any
      path = path.replace(/['"`)]+$/, '').trim();
      if (!path || path.length === 0) continue;

      const key = `${method} ${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const endpoint: ExtractedEndpoint = { method, path };

      // Try to find a function name from nearby context
      const fnName = findFunctionName(lines, i);
      if (fnName) endpoint.functionName = fnName;

      endpoints.push(endpoint);
    }

    // Pattern 2: fetch('/path') — default GET
    const fetchRegex = /\bfetch\s*\(\s*['"`]([^'"`$]+)/g;
    while ((match = fetchRegex.exec(line)) !== null) {
      const path = match[1].replace(/['"`)]+$/, '').trim();
      if (!path || path.length === 0) continue;

      const key = `GET ${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const endpoint: ExtractedEndpoint = { method: 'GET', path };

      const fnName = findFunctionName(lines, i);
      if (fnName) endpoint.functionName = fnName;

      endpoints.push(endpoint);
    }

    // Pattern 3: template literal — e.g. api.get(`/items/${id}`)
    // Extract the static prefix before the first ${
    const templateRegex =
      /\.\s*(get|post|put|delete|patch)\s*\(\s*`([^`]*?)\$\{/gi;
    while ((match = templateRegex.exec(line)) !== null) {
      const method = match[1].toUpperCase();
      const path = match[2].trim();
      if (!path || path.length === 0) continue;

      const key = `${method} ${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const endpoint: ExtractedEndpoint = { method, path };

      const fnName = findFunctionName(lines, i);
      if (fnName) endpoint.functionName = fnName;

      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

/**
 * Look backwards from the current line to find a function/method name.
 * Matches patterns like:
 *   getAll: () =>
 *   async function getAll()
 *   getAll() {
 */
function findFunctionName(lines: string[], lineIndex: number): string | undefined {
  // Check current line and up to 3 lines above
  for (let i = lineIndex; i >= Math.max(0, lineIndex - 3); i--) {
    const line = lines[i];

    // Pattern: export const name = (args) =>  or  const name = (args) =>
    const constArrow = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*:\s*\w[^=]*=>)/);
    if (constArrow) return constArrow[1];

    // Pattern: propertyName: (args) =>   or   propertyName: function
    const propMatch = line.match(/(\w+)\s*:\s*(?:\([^)]*\)\s*=>|function\b)/);
    if (propMatch) return propMatch[1];

    // Pattern: async function name() or function name()
    const fnMatch = line.match(/(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) return fnMatch[1];

    // Pattern: name(args) {  (method shorthand)
    const methodMatch = line.match(/^\s*(\w+)\s*\([^)]*\)\s*\{/);
    if (methodMatch) return methodMatch[1];
  }

  return undefined;
}
