import { describe, it, expect, vi } from 'vitest';
import { generateMocks } from '../../mock/mock-generator.js';
import type { PageAnalysis } from '../../analysis/types.js';
import type { MockGeneratorOptions } from '../../mock/types.js';

// Mock the LLM client to avoid real API calls
vi.mock('../../mock/llm-client.js', () => ({
  LlmClient: vi.fn().mockImplementation(() => ({
    generate: vi.fn(),
  })),
}));

import { LlmClient } from '../../mock/llm-client.js';

const mockOptions: MockGeneratorOptions = {
  apiKey: 'test-key',
  model: 'claude-sonnet-4-20250514',
};

function makeAnalysis(overrides: Partial<PageAnalysis> = {}): PageAnalysis {
  return {
    route: {
      urlPath: '/dashboard',
      filePath: '/project/app/dashboard/page.tsx',
      params: [],
      isDynamic: false,
    },
    sourceContext: 'import { getReports } from "@/lib/api-client";',
    resolvedImports: [],
    unresolvedImports: [],
    authConfig: {
      hasAuth: true,
      cookieNames: ['access_token'],
      authCheckEndpoint: '/auth/me',
      apiBaseUrl: 'http://localhost:8000/api',
    },
    hasApiDependencies: true,
    estimatedTokens: 100,
    apiClientPath: null,
    extractedEndpoints: [],
    apiBaseUrl: null,
    ...overrides,
  };
}

describe('generateMocks', () => {
  it('should return fallback configs for pages without API dependencies', async () => {
    const analysis = makeAnalysis({ hasApiDependencies: false });

    const result = await generateMocks(analysis, mockOptions);

    expect(result.configs).toHaveLength(4); // success, empty, error, loading
    expect(result.configs.map(c => c.stateName)).toEqual(['success', 'empty', 'error', 'loading']);
    expect(result.tokenUsage.input).toBe(0); // No LLM call made
    expect(result.tokenUsage.output).toBe(0);
  });

  it('should include auth mock in fallback when auth is detected', async () => {
    const analysis = makeAnalysis({ hasApiDependencies: false });

    const result = await generateMocks(analysis, mockOptions);

    for (const config of result.configs) {
      expect(config.authMock).not.toBeNull();
      expect(config.authMock!.cookies).toHaveProperty('access_token');
    }
  });

  it('should not include auth mock when no auth detected', async () => {
    const analysis = makeAnalysis({
      hasApiDependencies: false,
      authConfig: { hasAuth: false, cookieNames: [], authCheckEndpoint: null, apiBaseUrl: null },
    });

    const result = await generateMocks(analysis, mockOptions);

    for (const config of result.configs) {
      expect(config.authMock).toBeNull();
    }
  });

  it('should parse valid LLM JSON response', async () => {
    const mockLlmResponse = JSON.stringify({
      apiEndpoints: [
        {
          urlPattern: '/reports',
          method: 'GET',
          states: {
            success: { status: 200, body: { reports: [{ id: '1', title: 'Report 1' }], total: 1, page: 1 } },
            empty: { status: 200, body: { reports: [], total: 0, page: 1 } },
            error: { status: 500, body: { detail: 'Internal server error' } },
            loading: { status: 200, body: { reports: [{ id: '1', title: 'Report 1' }], total: 1, page: 1 }, delay: 3000 },
          },
        },
      ],
      authMock: {
        cookies: { access_token: 'mock_token' },
        authCheckEndpoint: '/auth/me',
        authCheckResponse: { status: 200, body: { id: 'user1', email: 'test@example.com', name: 'Test' } },
      },
    });

    const MockedLlmClient = vi.mocked(LlmClient);
    MockedLlmClient.mockImplementation(() => ({
      generate: vi.fn().mockResolvedValue({
        content: mockLlmResponse,
        inputTokens: 500,
        outputTokens: 300,
      }),
    }) as any);

    const analysis = makeAnalysis();
    const result = await generateMocks(analysis, mockOptions);

    expect(result.configs).toHaveLength(4);

    // Success variant
    const success = result.configs.find(c => c.stateName === 'success')!;
    expect(success.apiMocks['GET /reports']).toBeDefined();
    expect(success.apiMocks['GET /reports'].status).toBe(200);

    // Error variant
    const error = result.configs.find(c => c.stateName === 'error')!;
    expect(error.apiMocks['GET /reports'].status).toBe(500);

    // Loading variant
    const loading = result.configs.find(c => c.stateName === 'loading')!;
    expect(loading.apiMocks['GET /reports'].delay).toBe(3000);

    // Auth mock
    expect(success.authMock).not.toBeNull();
    expect(success.authMock!.cookies.access_token).toBe('mock_token');

    // Token usage
    expect(result.tokenUsage.input).toBe(500);
    expect(result.tokenUsage.output).toBe(300);
  });

  it('should handle LLM response with markdown code fences', async () => {
    const jsonContent = JSON.stringify({
      apiEndpoints: [
        {
          urlPattern: '/data',
          method: 'GET',
          states: {
            success: { status: 200, body: { items: [] } },
            empty: { status: 200, body: { items: [] } },
            error: { status: 500, body: { detail: 'Error' } },
            loading: { status: 200, body: { items: [] }, delay: 3000 },
          },
        },
      ],
    });

    const MockedLlmClient = vi.mocked(LlmClient);
    MockedLlmClient.mockImplementation(() => ({
      generate: vi.fn().mockResolvedValue({
        content: '```json\n' + jsonContent + '\n```',
        inputTokens: 100,
        outputTokens: 100,
      }),
    }) as any);

    const analysis = makeAnalysis();
    const result = await generateMocks(analysis, mockOptions);

    expect(result.configs).toHaveLength(4);
    expect(result.configs[0].apiMocks['GET /data']).toBeDefined();
  });

  it('should fall back gracefully on invalid LLM response', async () => {
    const MockedLlmClient = vi.mocked(LlmClient);
    MockedLlmClient.mockImplementation(() => ({
      generate: vi.fn().mockResolvedValue({
        content: 'This is not valid JSON at all',
        inputTokens: 100,
        outputTokens: 50,
      }),
    }) as any);

    const analysis = makeAnalysis();
    const result = await generateMocks(analysis, mockOptions);

    // Should return fallback configs
    expect(result.configs).toHaveLength(4);
    expect(result.tokenUsage.input).toBe(100);
  });

  it('should fall back gracefully on LLM API error', async () => {
    const MockedLlmClient = vi.mocked(LlmClient);
    MockedLlmClient.mockImplementation(() => ({
      generate: vi.fn().mockRejectedValue(new Error('API rate limit')),
    }) as any);

    const analysis = makeAnalysis();
    const result = await generateMocks(analysis, mockOptions);

    // Should return fallback configs
    expect(result.configs).toHaveLength(4);
    expect(result.tokenUsage.input).toBe(0);
  });

  it('should generate route params for dynamic routes', async () => {
    const analysis = makeAnalysis({
      hasApiDependencies: false,
      route: {
        urlPath: '/editor/:reportId',
        filePath: '/project/app/editor/[reportId]/page.tsx',
        params: [{ name: 'reportId', isCatchAll: false, isOptional: false }],
        isDynamic: true,
      },
    });

    const result = await generateMocks(analysis, mockOptions);

    for (const config of result.configs) {
      expect(config.routeParams).toBeDefined();
      expect(config.routeParams!.reportId).toBeDefined();
    }
  });

  it('should respect custom variant selection', async () => {
    const analysis = makeAnalysis({ hasApiDependencies: false });

    const result = await generateMocks(analysis, {
      ...mockOptions,
      variants: ['success', 'error'],
    });

    expect(result.configs).toHaveLength(2);
    expect(result.configs.map(c => c.stateName)).toEqual(['success', 'error']);
  });
});
