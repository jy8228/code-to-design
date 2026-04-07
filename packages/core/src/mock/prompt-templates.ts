import type { PageAnalysis } from '../analysis/types.js';

export const SYSTEM_PROMPT = `You are a mock data generator for a UI pre-rendering tool called Code to Design.
Your job is to analyze a Next.js page's source code and generate realistic mock API responses that will make the page render correctly in different visual states.

Rules:
1. Output ONLY valid JSON — no markdown, no code fences, no explanation.
2. Mock data must match the TypeScript interfaces and API response shapes found in the source code.
3. Generate contextually appropriate data (e.g., real company names for a finance app, realistic usernames for a social app).
4. Generate MULTIPLE items in success data (at least 3-5 items for list endpoints).
5. If actual API endpoint URLs are provided, use those EXACT paths in your response.
6. Analyze the page's conditional rendering (if/else, ternary, switch, state variables) to identify meaningful visual states — not just generic success/error.
7. Include auth mock data if the page requires authentication.
8. For dynamic route parameters, generate a realistic sample value.`;

/**
 * Build the user prompt for mock generation from a PageAnalysis.
 */
export function buildUserPrompt(analysis: PageAnalysis): string {
  const parts: string[] = [];

  parts.push(`## Page Route: ${analysis.route.urlPath}`);
  parts.push(`## Page File: ${analysis.route.filePath}`);

  if (analysis.route.isDynamic) {
    parts.push(`## Dynamic Parameters: ${analysis.route.params.map(p => p.name).join(', ')}`);
  }

  // Include extracted endpoints if available
  if (analysis.extractedEndpoints.length > 0) {
    parts.push('## Actual API Endpoints (use these EXACT paths)');
    for (const ep of analysis.extractedEndpoints) {
      const name = ep.functionName ? ` (${ep.functionName})` : '';
      parts.push(`- ${ep.method} ${ep.path}${name}`);
    }
    if (analysis.apiBaseUrl) {
      parts.push(`- Base URL: ${analysis.apiBaseUrl}`);
    }
  }

  parts.push('## Source Code Context');
  parts.push(analysis.sourceContext);

  if (analysis.authConfig.hasAuth) {
    parts.push('## Auth Configuration');
    parts.push(`- Requires authentication: yes`);
    if (analysis.authConfig.cookieNames.length > 0) {
      parts.push(`- Auth cookies: ${analysis.authConfig.cookieNames.join(', ')}`);
    }
    if (analysis.authConfig.authCheckEndpoint) {
      parts.push(`- Auth check endpoint: ${analysis.authConfig.authCheckEndpoint}`);
    }
    if (analysis.authConfig.apiBaseUrl) {
      parts.push(`- API base URL: ${analysis.authConfig.apiBaseUrl}`);
    }
  }

  parts.push(`
## Required Output Format

Analyze the page code carefully. Look at:
- Conditional rendering (if/else, ternary operators, switch statements)
- State variables that control what is displayed
- URL parameters or search params that affect the view
- Authentication state checks
- Data loading patterns

Then generate mock data for **page-specific visual states** — not just generic success/error. For example:
- A dashboard with tabs might have states: "overview_tab", "readings_tab", "settings_tab"
- A page checking auth might have: "authenticated_with_data", "authenticated_empty", "unauthenticated"
- A results page might have: "results_found", "no_results", "invalid_id"

Always include at least these base states:
- One state with realistic populated data (the "happy path")
- One state with empty/no data
- One error state (API returns 500)

Return a JSON object with this exact structure:
{
  "routeParams": { "paramName": "sampleValue" },
  "stateVariants": [
    {
      "name": "descriptive_state_name",
      "description": "What this state represents visually",
      "apiMocks": {
        "METHOD /endpoint/path": {
          "status": 200,
          "body": { ... },
          "delay": 0
        }
      }
    }
  ],
  "authMock": {
    "cookies": { "cookie_name": "mock_value" },
    "authCheckEndpoint": "/auth/me",
    "authCheckResponse": { "status": 200, "body": { ... } }
  }
}

IMPORTANT:
- Use the ACTUAL endpoint paths from the "Actual API Endpoints" section above if provided.
- Each state variant should produce a VISUALLY DIFFERENT page render.
- Generate at least 3-5 items in list/array responses for the happy path state.
- Generate ONLY the JSON. No explanation, no markdown fences.`);

  return parts.join('\n\n');
}
