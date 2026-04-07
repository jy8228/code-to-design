import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { AuthConfig } from './types.js';

const MIDDLEWARE_FILES = ['middleware.ts', 'middleware.js', 'middleware.tsx', 'middleware.jsx'];

/**
 * Extract cookie names from middleware source code.
 * Looks for patterns like: request.cookies.get('access_token')
 */
function extractCookieNames(source: string): string[] {
  const cookies: string[] = [];
  const regex = /cookies\.get\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    cookies.push(match[1]);
  }
  return [...new Set(cookies)];
}

/**
 * Extract API base URL from environment configuration.
 * Looks for NEXT_PUBLIC_API_URL or similar patterns.
 */
function extractApiBaseUrl(source: string): string | null {
  const regex = /process\.env\.(\w*API_URL\w*)\s*\|\|\s*['"]([^'"]+)['"]/;
  const match = source.match(regex);
  if (match) return match[2];

  const simpleRegex = /['"]https?:\/\/[^'"]+\/api['"]/;
  const simpleMatch = source.match(simpleRegex);
  if (simpleMatch) return simpleMatch[0].replace(/['"]/g, '');

  return null;
}

/**
 * Extract auth check endpoint from source code.
 * Looks for patterns like: fetch(`${base}/auth/me`)
 */
function extractAuthCheckEndpoint(source: string): string | null {
  const patterns = [
    /[`'"](\/auth\/me)[`'"]/,
    /[`'"](\/api\/auth\/me)[`'"]/,
    /[`'"](\/auth\/session)[`'"]/,
    /[`'"](\/api\/auth\/session)[`'"]/,
    /[`'"](\/auth\/user)[`'"]/,
    /[`'"](\/api\/user\/me)[`'"]/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Detect authentication patterns in the target project.
 *
 * Scans for:
 * 1. middleware.ts/js with cookie checks
 * 2. Auth context providers with auth-check endpoints
 * 3. API base URL configuration
 */
export async function detectAuth(projectRoot: string, allSources: string[]): Promise<AuthConfig> {
  const config: AuthConfig = {
    hasAuth: false,
    cookieNames: [],
    authCheckEndpoint: null,
    apiBaseUrl: null,
  };

  // 1. Check for middleware
  for (const filename of MIDDLEWARE_FILES) {
    const middlewarePath = join(projectRoot, filename);
    if (existsSync(middlewarePath)) {
      try {
        const source = await readFile(middlewarePath, 'utf-8');
        const cookies = extractCookieNames(source);
        if (cookies.length > 0) {
          config.hasAuth = true;
          config.cookieNames.push(...cookies);
        }
      } catch {
        // Middleware exists but can't be read — skip
      }
    }
  }

  // 2. Scan all collected sources for auth patterns
  const combinedSource = allSources.join('\n');

  const authEndpoint = extractAuthCheckEndpoint(combinedSource);
  if (authEndpoint) {
    config.hasAuth = true;
    config.authCheckEndpoint = authEndpoint;
  }

  // Look for auth context patterns
  if (/useAuth|AuthProvider|AuthContext|SessionProvider/i.test(combinedSource)) {
    config.hasAuth = true;
  }

  // 3. Extract API base URL
  config.apiBaseUrl = extractApiBaseUrl(combinedSource);

  return config;
}
