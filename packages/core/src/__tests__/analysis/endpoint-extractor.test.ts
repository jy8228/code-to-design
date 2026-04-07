import { describe, it, expect } from 'vitest';
import { extractEndpoints, extractBaseUrl } from '../../analysis/endpoint-extractor.js';

describe('extractEndpoints', () => {
  it('should extract api.get call', () => {
    const source = `export const getAll = () => api.get('/readings/');`;
    const result = extractEndpoints(source);

    expect(result).toEqual([
      { method: 'GET', path: '/readings/', functionName: 'getAll' },
    ]);
  });

  it('should extract api.post call', () => {
    const source = `export const login = (data) => api.post('/auth/login', data);`;
    const result = extractEndpoints(source);

    expect(result).toEqual([
      { method: 'POST', path: '/auth/login', functionName: 'login' },
    ]);
  });

  it('should extract axios.delete with template literal', () => {
    const source = `export const removeItem = (id) => axios.delete(\`/items/\${id}\`);`;
    const result = extractEndpoints(source);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const deleteEndpoint = result.find(e => e.method === 'DELETE');
    expect(deleteEndpoint).toBeDefined();
    expect(deleteEndpoint!.path).toBe('/items/');
  });

  it('should return empty array when no endpoints', () => {
    const source = `
      const x = 42;
      export function helper() { return x + 1; }
    `;
    const result = extractEndpoints(source);
    expect(result).toEqual([]);
  });

  it('should extract multiple endpoints', () => {
    const source = `
      const apiClient = {
        getAll: () => api.get('/api/v1/readings/'),
        create: (data) => api.post('/api/v1/readings/', data),
        update: (id, data) => api.put('/api/v1/readings/' + id, data),
      };
    `;
    const result = extractEndpoints(source);

    expect(result.length).toBe(3);
    expect(result.map(e => e.method)).toEqual(['GET', 'POST', 'PUT']);
    expect(result.map(e => e.path)).toEqual([
      '/api/v1/readings/',
      '/api/v1/readings/',
      '/api/v1/readings/',
    ]);
  });

  it('should extract fetch calls as GET', () => {
    const source = `const data = await fetch('/api/items');`;
    const result = extractEndpoints(source);

    expect(result).toEqual([
      { method: 'GET', path: '/api/items' },
    ]);
  });

  it('should detect function names from property syntax', () => {
    const source = `
      const client = {
        getProfile: () => api.get('/api/v1/users/profile'),
      };
    `;
    const result = extractEndpoints(source);

    expect(result.length).toBe(1);
    expect(result[0].functionName).toBe('getProfile');
  });

  it('should handle sajusecrets-style nested API client', () => {
    const source = `
      export const apiClient = {
        auth: {
          register: (data: any) => api.post('/api/v1/auth/register', data),
          login: (data: any) => api.post('/api/v1/auth/login', data),
        },
        readings: {
          getAll: () => api.get('/api/v1/readings/'),
          getById: (id: string) => api.get(\`/api/v1/readings/\${id}\`),
        },
      };
    `;
    const result = extractEndpoints(source);

    // getAll and getById both resolve to GET /api/v1/readings/ (template literal truncated)
    // so dedup reduces them to 3 unique method+path combos
    expect(result.length).toBeGreaterThanOrEqual(3);
    const methods = result.map(e => e.method);
    expect(methods).toContain('POST');
    expect(methods).toContain('GET');

    const paths = result.map(e => e.path);
    expect(paths).toContain('/api/v1/auth/register');
    expect(paths).toContain('/api/v1/auth/login');
    expect(paths).toContain('/api/v1/readings/');
  });
});

describe('extractBaseUrl', () => {
  it('should extract base URL from env fallback pattern', () => {
    const source = `const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';`;
    expect(extractBaseUrl(source)).toBe('http://localhost:8000');
  });

  it('should extract base URL from baseURL property', () => {
    const source = `const api = axios.create({ baseURL: 'http://localhost:8000/api' });`;
    expect(extractBaseUrl(source)).toBe('http://localhost:8000/api');
  });

  it('should extract base URL from constant assignment', () => {
    const source = `const API_BASE_URL = 'https://api.example.com';`;
    expect(extractBaseUrl(source)).toBe('https://api.example.com');
  });

  it('should return null when no base URL found', () => {
    const source = `const x = 42;`;
    expect(extractBaseUrl(source)).toBeNull();
  });
});
