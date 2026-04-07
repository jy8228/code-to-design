import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startCanvasServer } from '../../server/canvas-server.js';

describe('CanvasServer', () => {
  let tmpDir: string;
  let canvasDir: string;
  let c2dDir: string;
  let server: Awaited<ReturnType<typeof startCanvasServer>>;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'c2d-test-'));
    canvasDir = join(tmpDir, 'canvas-dist');
    c2dDir = join(tmpDir, '.c2d');

    await mkdir(canvasDir, { recursive: true });
    await mkdir(join(c2dDir, 'renders'), { recursive: true });

    // Create a minimal index.html for the canvas app
    await writeFile(join(canvasDir, 'index.html'), '<html><body>Canvas</body></html>');

    // Create a mock manifest
    const manifest = {
      generatedAt: '2026-04-01T00:00:00Z',
      projectName: 'test-project',
      routes: [],
    };
    await writeFile(join(c2dDir, 'manifest.json'), JSON.stringify(manifest));

    // Create a mock render file
    await writeFile(join(c2dDir, 'renders', 'page.html'), '<html><body>Rendered</body></html>');

    server = await startCanvasServer({
      port: 0, // random available port
      canvasDir,
      c2dDir,
    });
  });

  afterAll(async () => {
    await server.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Reset comments before each test by removing comments.json if it exists
    try {
      const { rm: rmFile } = await import('node:fs/promises');
      await rmFile(join(c2dDir, 'comments.json'), { force: true });
    } catch {
      // ignore
    }
  });

  it('starts and listens on the configured port', () => {
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it('GET /api/manifest returns the manifest JSON', async () => {
    const res = await fetch(`${server.url}/api/manifest`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = await res.json() as Record<string, unknown>;
    expect(data.projectName).toBe('test-project');
    expect(data.routes).toEqual([]);
  });

  it('GET /api/manifest returns 404 when no manifest exists', async () => {
    // Start a server pointing to an empty c2d dir
    const emptyDir = join(tmpDir, 'empty-c2d');
    await mkdir(emptyDir, { recursive: true });
    const emptyServer = await startCanvasServer({
      port: 0,
      canvasDir,
      c2dDir: emptyDir,
    });
    try {
      const res = await fetch(`${emptyServer.url}/api/manifest`);
      expect(res.status).toBe(404);
    } finally {
      await emptyServer.close();
    }
  });

  it('GET /api/comments returns empty array initially', async () => {
    const res = await fetch(`${server.url}/api/comments`);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toEqual([]);
  });

  it('POST /api/comments creates a comment and returns it', async () => {
    const res = await fetch(`${server.url}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x: 100,
        y: 200,
        text: 'Looks great!',
        author: 'tester',
      }),
    });
    expect(res.status).toBe(201);
    const comment = await res.json() as Record<string, unknown>;
    expect(comment.id).toBeDefined();
    expect(comment.x).toBe(100);
    expect(comment.y).toBe(200);
    expect(comment.text).toBe('Looks great!');
    expect(comment.author).toBe('tester');
    expect(comment.timestamp).toBeDefined();
  });

  it('GET /api/comments returns created comments', async () => {
    // Create a comment first
    await fetch(`${server.url}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 10, y: 20, text: 'Hello', author: 'alice' }),
    });

    const res = await fetch(`${server.url}/api/comments`);
    expect(res.status).toBe(200);
    const comments = await res.json() as Array<Record<string, unknown>>;
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('Hello');
  });

  it('DELETE /api/comments/:id removes a comment', async () => {
    // Create a comment
    const createRes = await fetch(`${server.url}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 50, y: 60, text: 'Delete me', author: 'bob' }),
    });
    const created = await createRes.json() as Record<string, unknown>;

    // Delete it
    const deleteRes = await fetch(`${server.url}/api/comments/${created.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);

    // Verify it's gone
    const listRes = await fetch(`${server.url}/api/comments`);
    const comments = await listRes.json() as unknown[];
    expect(comments).toHaveLength(0);
  });

  it('DELETE /api/comments/:id returns 404 for unknown id', async () => {
    const res = await fetch(`${server.url}/api/comments/nonexistent`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/comments rejects invalid body', async () => {
    const res = await fetch(`${server.url}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 10 }), // missing fields
    });
    expect(res.status).toBe(400);
  });

  it('serves canvas app index.html on root', async () => {
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Canvas');
  });

  it('serves renders under /renders/ path', async () => {
    const res = await fetch(`${server.url}/renders/page.html`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Rendered');
  });

  it('sets CORS headers on responses', async () => {
    const res = await fetch(`${server.url}/api/comments`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
