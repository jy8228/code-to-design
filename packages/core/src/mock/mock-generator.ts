import type { PageAnalysis } from '../analysis/types.js';
import type { MockConfig, MockResponse, MockGeneratorOptions } from './types.js';
import { LlmClient } from './llm-client.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt-templates.js';

/**
 * New format: LLM returns state variants with per-state API mocks.
 */
interface LlmMockOutputV2 {
  routeParams?: Record<string, string>;
  stateVariants?: Array<{
    name: string;
    description?: string;
    apiMocks: Record<string, { status: number; body: unknown; delay?: number }>;
  }>;
  authMock?: {
    cookies: Record<string, string>;
    authCheckEndpoint: string;
    authCheckResponse: { status: number; body: unknown };
  };
}

/**
 * Legacy format: per-endpoint states.
 */
interface LlmMockOutputV1 {
  routeParams?: Record<string, string>;
  apiEndpoints?: Array<{
    urlPattern: string;
    method: string;
    states: Record<string, { status: number; body: unknown; delay?: number }>;
  }>;
  authMock?: {
    cookies: Record<string, string>;
    authCheckEndpoint: string;
    authCheckResponse: { status: number; body: unknown };
  };
}

type LlmMockOutput = LlmMockOutputV2 | LlmMockOutputV1;

/**
 * Parse the LLM response as JSON, handling common formatting issues.
 */
function parseLlmJson(content: string): LlmMockOutput | null {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Check if output uses the new V2 format (stateVariants).
 */
function isV2Output(output: LlmMockOutput): output is LlmMockOutputV2 {
  return 'stateVariants' in output && Array.isArray((output as LlmMockOutputV2).stateVariants);
}

/**
 * Convert V2 (stateVariants) output to MockConfig[].
 */
function convertV2ToMockConfigs(
  output: LlmMockOutputV2,
  analysis: PageAnalysis,
): MockConfig[] {
  if (!output.stateVariants || output.stateVariants.length === 0) {
    return [];
  }

  return output.stateVariants.map(variant => {
    const apiMocks: Record<string, MockResponse> = {};
    for (const [pattern, mock] of Object.entries(variant.apiMocks)) {
      apiMocks[pattern] = {
        status: mock.status,
        body: mock.body,
        delay: mock.delay,
      };
    }

    let authMock: MockConfig['authMock'] = null;
    if (analysis.authConfig.hasAuth && output.authMock) {
      authMock = {
        cookies: output.authMock.cookies,
        authCheckResponse: {
          status: output.authMock.authCheckResponse.status,
          body: output.authMock.authCheckResponse.body,
        },
      };
    }

    return {
      stateName: variant.name,
      apiMocks,
      authMock,
      routeParams: output.routeParams,
    };
  });
}

/**
 * Convert V1 (per-endpoint states) output to MockConfig[].
 * Legacy format support.
 */
function convertV1ToMockConfigs(
  output: LlmMockOutputV1,
  analysis: PageAnalysis,
  variants: string[],
): MockConfig[] {
  const configs: MockConfig[] = [];

  for (const variant of variants) {
    const apiMocks: Record<string, MockResponse> = {};

    if (output.apiEndpoints) {
      for (const endpoint of output.apiEndpoints) {
        const stateData = endpoint.states[variant];
        if (stateData) {
          const key = `${endpoint.method} ${endpoint.urlPattern}`;
          apiMocks[key] = {
            status: stateData.status,
            body: stateData.body,
            delay: stateData.delay,
          };
        }
      }
    }

    let authMock: MockConfig['authMock'] = null;
    if (analysis.authConfig.hasAuth && output.authMock) {
      authMock = {
        cookies: output.authMock.cookies,
        authCheckResponse: {
          status: output.authMock.authCheckResponse.status,
          body: output.authMock.authCheckResponse.body,
        },
      };
    }

    configs.push({
      stateName: variant,
      apiMocks,
      authMock,
      routeParams: output.routeParams,
    });
  }

  return configs;
}

/**
 * Generate a fallback MockConfig when LLM fails or page has no API deps.
 */
function generateFallbackConfigs(
  analysis: PageAnalysis,
  variants: string[],
): MockConfig[] {
  return variants.map(variant => ({
    stateName: variant,
    apiMocks: {},
    authMock: analysis.authConfig.hasAuth
      ? {
          cookies: Object.fromEntries(
            analysis.authConfig.cookieNames.map(name => [name, 'mock_token_c2d']),
          ),
          authCheckResponse: variant === 'error'
            ? { status: 401, body: { detail: 'Unauthorized' } }
            : { status: 200, body: { id: 'mock_user', email: 'demo@c2d.dev', name: 'Demo User' } },
        }
      : null,
    routeParams: analysis.route.isDynamic
      ? Object.fromEntries(analysis.route.params.map(p => [p.name, 'sample-1']))
      : undefined,
  }));
}

/**
 * Generate mock data for a single page using an LLM.
 *
 * Returns one MockConfig per state variant (page-specific or fallback).
 */
export async function generateMocks(
  analysis: PageAnalysis,
  options: MockGeneratorOptions,
): Promise<{ configs: MockConfig[]; tokenUsage: { input: number; output: number } }> {
  const variants = options.variants ?? ['success', 'empty', 'error', 'loading'];

  // If no API dependencies, just return fallback configs (no LLM call needed)
  if (!analysis.hasApiDependencies) {
    return {
      configs: generateFallbackConfigs(analysis, variants),
      tokenUsage: { input: 0, output: 0 },
    };
  }

  const client = new LlmClient(options.apiKey, options.model);
  const userPrompt = buildUserPrompt(analysis);

  try {
    const response = await client.generate(SYSTEM_PROMPT, userPrompt);
    const parsed = parseLlmJson(response.content);

    if (!parsed) {
      console.warn(`[c2d] Failed to parse LLM response for ${analysis.route.urlPath}, using fallback`);
      return {
        configs: generateFallbackConfigs(analysis, variants),
        tokenUsage: { input: response.inputTokens, output: response.outputTokens },
      };
    }

    let configs: MockConfig[];

    if (isV2Output(parsed)) {
      // New format: page-specific state variants
      configs = convertV2ToMockConfigs(parsed, analysis);
    } else {
      // Legacy format: per-endpoint states
      configs = convertV1ToMockConfigs(parsed, analysis, variants);
    }

    // Ensure we have at least one config
    if (configs.length === 0) {
      configs = generateFallbackConfigs(analysis, variants);
    }

    return {
      configs,
      tokenUsage: { input: response.inputTokens, output: response.outputTokens },
    };
  } catch (error) {
    console.warn(`[c2d] LLM call failed for ${analysis.route.urlPath}: ${error}`);
    return {
      configs: generateFallbackConfigs(analysis, variants),
      tokenUsage: { input: 0, output: 0 },
    };
  }
}

/**
 * Generate mocks for all analyzed pages.
 */
export async function generateAllMocks(
  analyses: PageAnalysis[],
  options: MockGeneratorOptions,
): Promise<{
  results: Map<string, MockConfig[]>;
  totalTokens: { input: number; output: number };
}> {
  const results = new Map<string, MockConfig[]>();
  const totalTokens = { input: 0, output: 0 };

  for (const analysis of analyses) {
    const { configs, tokenUsage } = await generateMocks(analysis, options);
    results.set(analysis.route.urlPath, configs);
    totalTokens.input += tokenUsage.input;
    totalTokens.output += tokenUsage.output;
  }

  return { results, totalTokens };
}
