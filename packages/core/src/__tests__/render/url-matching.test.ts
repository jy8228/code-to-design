import { describe, it, expect } from 'vitest';
import { matchMockUrl } from '../../render/url-matcher.js';

describe('matchMockUrl', () => {
  // ── Exact / full-path matching ──────────────────────────────────────

  it('exact match: /api/readings matches http://localhost:8000/api/readings', () => {
    expect(matchMockUrl('http://localhost:8000/api/readings', 'GET', 'GET /api/readings')).toBe(true);
  });

  it('exact match with deeper path', () => {
    expect(matchMockUrl('http://localhost:8000/api/v1/reports', 'GET', 'GET /api/v1/reports')).toBe(true);
  });

  // ── Suffix matching ─────────────────────────────────────────────────

  it('suffix match: /readings matches http://localhost:8000/api/v1/readings', () => {
    expect(matchMockUrl('http://localhost:8000/api/v1/readings', 'GET', 'GET /readings')).toBe(true);
  });

  it('suffix match with multiple segments: /v1/readings matches /api/v1/readings', () => {
    expect(matchMockUrl('http://localhost:8000/api/v1/readings', 'GET', 'GET /v1/readings')).toBe(true);
  });

  // ── Trailing slash normalization ────────────────────────────────────

  it('trailing slash on URL: /readings/ matches /readings', () => {
    expect(matchMockUrl('http://localhost:8000/api/readings/', 'GET', 'GET /api/readings')).toBe(true);
  });

  it('trailing slash on pattern: /readings matches /readings/', () => {
    expect(matchMockUrl('http://localhost:8000/api/readings', 'GET', 'GET /api/readings/')).toBe(true);
  });

  it('trailing slash on both', () => {
    expect(matchMockUrl('http://localhost:8000/api/readings/', 'GET', 'GET /api/readings/')).toBe(true);
  });

  // ── Param placeholders ──────────────────────────────────────────────

  it('curly-brace param: /readings/{id} matches /readings/123', () => {
    expect(matchMockUrl('http://localhost:8000/readings/123', 'GET', 'GET /readings/{id}')).toBe(true);
  });

  it('curly-brace param via suffix: /readings/{id} matches /api/v1/readings/456', () => {
    expect(matchMockUrl('http://localhost:8000/api/v1/readings/456', 'GET', 'GET /readings/{id}')).toBe(true);
  });

  it('colon param: /readings/:id matches /readings/123', () => {
    expect(matchMockUrl('http://localhost:8000/readings/123', 'GET', 'GET /readings/:id')).toBe(true);
  });

  it('colon param via suffix: /readings/:id matches /api/readings/789', () => {
    expect(matchMockUrl('http://localhost:8000/api/readings/789', 'GET', 'GET /readings/:id')).toBe(true);
  });

  it('wildcard param: /readings/* matches /readings/abc', () => {
    expect(matchMockUrl('http://localhost:8000/readings/abc', 'GET', 'GET /readings/*')).toBe(true);
  });

  // ── Non-matches ─────────────────────────────────────────────────────

  it('no match: /users does NOT match /readings', () => {
    expect(matchMockUrl('http://localhost:8000/api/readings', 'GET', 'GET /users')).toBe(false);
  });

  it('no match: completely different paths', () => {
    expect(matchMockUrl('http://localhost:8000/api/v1/reports', 'GET', 'GET /users')).toBe(false);
  });

  // ── Method mismatch ─────────────────────────────────────────────────

  it('method mismatch: GET /readings does NOT match POST request', () => {
    expect(matchMockUrl('http://localhost:8000/api/readings', 'POST', 'GET /readings')).toBe(false);
  });

  it('method mismatch: DELETE pattern does NOT match GET request', () => {
    expect(matchMockUrl('http://localhost:8000/api/readings/1', 'GET', 'DELETE /readings/{id}')).toBe(false);
  });
});
