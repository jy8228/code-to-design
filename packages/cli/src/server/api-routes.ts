import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * A single pen stroke on the drawing canvas.
 */
export interface DrawingStroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

/**
 * A comment pinned to a canvas coordinate.
 */
export interface Comment {
  id: string;
  x: number;
  y: number;
  text: string;
  author: string;
  timestamp: string;
}

/**
 * Handle API requests under the /api/ prefix.
 *
 * Returns true if the request was handled, false otherwise.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  c2dDir: string,
): Promise<boolean> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (url === '/api/manifest' && method === 'GET') {
    await handleGetManifest(res, c2dDir);
    return true;
  }

  if (url === '/api/comments' && method === 'GET') {
    await handleGetComments(res, c2dDir);
    return true;
  }

  if (url === '/api/comments' && method === 'POST') {
    await handlePostComment(req, res, c2dDir);
    return true;
  }

  const deleteMatch = url.match(/^\/api\/comments\/(.+)$/);
  if (deleteMatch && method === 'DELETE') {
    await handleDeleteComment(res, c2dDir, deleteMatch[1]);
    return true;
  }

  if (url === '/api/drawings' && method === 'GET') {
    await handleGetDrawings(res, c2dDir);
    return true;
  }

  if (url === '/api/drawings' && method === 'POST') {
    await handlePostDrawings(req, res, c2dDir);
    return true;
  }

  return false;
}

// --- Handlers ---

async function handleGetManifest(
  res: ServerResponse,
  c2dDir: string,
): Promise<void> {
  const manifestPath = join(c2dDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    sendJson(res, 404, { error: 'manifest.json not found' });
    return;
  }
  const data = await readFile(manifestPath, 'utf-8');
  sendRawJson(res, 200, data);
}

async function handleGetComments(
  res: ServerResponse,
  c2dDir: string,
): Promise<void> {
  const comments = await loadComments(c2dDir);
  sendJson(res, 200, comments);
}

async function handlePostComment(
  req: IncomingMessage,
  res: ServerResponse,
  c2dDir: string,
): Promise<void> {
  const body = await readRequestBody(req);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!isValidCommentInput(parsed)) {
    sendJson(res, 400, { error: 'Missing required fields: x, y, text, author' });
    return;
  }

  const comment: Comment = {
    id: randomUUID(),
    x: parsed.x,
    y: parsed.y,
    text: parsed.text,
    author: parsed.author,
    timestamp: new Date().toISOString(),
  };

  const comments = await loadComments(c2dDir);
  comments.push(comment);
  await saveComments(c2dDir, comments);
  sendJson(res, 201, comment);
}

async function handleDeleteComment(
  res: ServerResponse,
  c2dDir: string,
  id: string,
): Promise<void> {
  const comments = await loadComments(c2dDir);
  const index = comments.findIndex(c => c.id === id);
  if (index === -1) {
    sendJson(res, 404, { error: 'Comment not found' });
    return;
  }
  comments.splice(index, 1);
  await saveComments(c2dDir, comments);
  sendJson(res, 200, { ok: true });
}

// --- Drawing Handlers ---

async function handleGetDrawings(
  res: ServerResponse,
  c2dDir: string,
): Promise<void> {
  const drawings = await loadDrawings(c2dDir);
  sendJson(res, 200, drawings);
}

async function handlePostDrawings(
  req: IncomingMessage,
  res: ServerResponse,
  c2dDir: string,
): Promise<void> {
  const body = await readRequestBody(req);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!Array.isArray(parsed)) {
    sendJson(res, 400, { error: 'Body must be an array of strokes' });
    return;
  }

  await saveDrawings(c2dDir, parsed as DrawingStroke[]);
  sendJson(res, 200, { ok: true });
}

async function loadDrawings(c2dDir: string): Promise<DrawingStroke[]> {
  const drawingsPath = join(c2dDir, 'drawings.json');
  if (!existsSync(drawingsPath)) {
    return [];
  }
  const data = await readFile(drawingsPath, 'utf-8');
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveDrawings(c2dDir: string, drawings: DrawingStroke[]): Promise<void> {
  const drawingsPath = join(c2dDir, 'drawings.json');
  const dir = dirname(drawingsPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(drawingsPath, JSON.stringify(drawings, null, 2), 'utf-8');
}

// --- Helpers ---

function isValidCommentInput(
  value: unknown,
): value is { x: number; y: number; text: string; author: string } {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.x === 'number' &&
    typeof obj.y === 'number' &&
    typeof obj.text === 'string' &&
    typeof obj.author === 'string'
  );
}

async function loadComments(c2dDir: string): Promise<Comment[]> {
  const commentsPath = join(c2dDir, 'comments.json');
  if (!existsSync(commentsPath)) {
    return [];
  }
  const data = await readFile(commentsPath, 'utf-8');
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveComments(c2dDir: string, comments: Comment[]): Promise<void> {
  const commentsPath = join(c2dDir, 'comments.json');
  const dir = dirname(commentsPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(commentsPath, JSON.stringify(comments, null, 2), 'utf-8');
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendRawJson(res: ServerResponse, status: number, jsonString: string): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(jsonString);
}
