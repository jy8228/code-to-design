/**
 * A single mock response for an API endpoint.
 */
export interface MockResponse {
  /** HTTP status code */
  status: number;
  /** Response body as JSON-serializable data */
  body: unknown;
  /** Optional delay in milliseconds before responding */
  delay?: number;
}

/**
 * A complete mock configuration for rendering a page in a specific state.
 */
export interface MockConfig {
  /** State variant name (e.g., "success", "error", "empty", "loading") */
  stateName: string;
  /** Map of URL patterns to mock responses */
  apiMocks: Record<string, MockResponse>;
  /** Mock user data for auth, if auth is required */
  authMock: {
    /** Cookies to inject (e.g., { access_token: "mock_token" }) */
    cookies: Record<string, string>;
    /** Auth check endpoint mock response */
    authCheckResponse: MockResponse | null;
  } | null;
  /** Sample route parameters for dynamic routes */
  routeParams?: Record<string, string>;
}

/**
 * State variants to generate for each page.
 */
export type StateVariant = 'success' | 'empty' | 'error' | 'loading';

export const ALL_STATE_VARIANTS: StateVariant[] = ['success', 'empty', 'error', 'loading'];

/**
 * Options for mock generation.
 */
export interface MockGeneratorOptions {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** State variants to generate (default: all) */
  variants?: StateVariant[];
}
