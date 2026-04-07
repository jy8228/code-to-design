/**
 * Smart URL matching for API mock interception.
 *
 * Supports:
 * - Full path matching (exact after normalization)
 * - Suffix matching (mock "/readings" matches url "/api/v1/readings")
 * - Trailing slash normalization
 * - Param placeholders: {id}, :id, and * wildcards
 */

/**
 * Check whether a request URL + method matches a mock pattern string.
 *
 * @param requestUrl  - The full URL from the intercepted request (e.g. "http://localhost:8000/api/v1/readings/")
 * @param requestMethod - HTTP method of the request (e.g. "GET")
 * @param mockPattern - Pattern from the mock config (e.g. "GET /readings" or "DELETE /readings/{id}")
 * @returns true if the request matches the mock pattern
 */
export function matchMockUrl(requestUrl: string, requestMethod: string, mockPattern: string): boolean {
  const [mockMethod, ...pathParts] = mockPattern.split(' ');
  if (requestMethod !== mockMethod) return false;

  let mockPath = pathParts.join(' ');

  // Normalize: strip trailing slashes for comparison
  mockPath = mockPath.replace(/\/+$/, '');
  const urlPath = new URL(requestUrl).pathname.replace(/\/+$/, '');

  // Convert param placeholders to regex segments
  const regexStr = mockPath
    .replace(/\{[^}]+\}/g, '[^/]+')
    .replace(/\*/g, '[^/]+')
    .replace(/:[a-zA-Z_]+/g, '[^/]+');

  // Strategy 1: Full path match
  const fullRegex = new RegExp('^' + regexStr.replace(/\//g, '\\/') + '$');
  if (fullRegex.test(urlPath)) return true;

  // Strategy 2: Suffix match (last N segments)
  // e.g., mock "/readings" matches url "/api/v1/readings"
  const mockSegments = mockPath.split('/').filter(Boolean);
  const urlSegments = urlPath.split('/').filter(Boolean);

  if (mockSegments.length >= 1 && urlSegments.length >= mockSegments.length) {
    const urlSuffix = urlSegments.slice(-mockSegments.length);
    const match = mockSegments.every((seg, i) => {
      if (seg.startsWith('{') || seg.startsWith(':') || seg === '*') return true;
      return seg === urlSuffix[i];
    });
    if (match) return true;
  }

  return false;
}
