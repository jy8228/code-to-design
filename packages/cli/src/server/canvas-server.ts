import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import sirv from 'sirv';
import { handleApiRequest } from './api-routes.js';

/**
 * Options for starting the canvas server.
 */
export interface CanvasServerOptions {
  /** Port to listen on (default: 4800) */
  port: number;
  /** Path to the built canvas app directory */
  canvasDir: string;
  /** Path to the .c2d/ output directory */
  c2dDir: string;
  /** Path to the target project root (for serving public/ assets) */
  projectRoot?: string;
}

const MAX_PORT_ATTEMPTS = 10;

/**
 * Try to listen on a port. Returns a promise that resolves on success
 * or rejects with the error.
 */
function tryListen(
  requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
  port: number,
): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer(requestHandler);
    server.once('error', reject);
    server.listen(port, () => {
      const actualPort = (server.address() as { port: number }).port;
      resolve({
        url: `http://localhost:${actualPort}`,
        port: actualPort,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) rejectClose(err);
              else resolveClose();
            });
          }),
      });
    });
  });
}

/**
 * Start the canvas server that serves:
 * 1. API endpoints under /api/
 * 2. Pre-rendered files from .c2d/renders/ under /renders/
 * 3. Canvas app static assets (SPA fallback) for everything else
 *
 * If the default port is in use, tries up to 10 consecutive ports.
 */
export async function startCanvasServer(options: CanvasServerOptions): Promise<{
  url: string;
  port: number;
  close: () => Promise<void>;
}> {
  const { port = 4800, canvasDir, c2dDir, projectRoot } = options;

  // Static file handlers
  const canvasHandler = sirv(canvasDir, { single: true, dev: true });
  const rendersDir = join(c2dDir, 'renders');
  const rendersHandler = sirv(rendersDir, { dev: true });

  // Serve target project's public/ folder for static assets (images, fonts, etc.)
  const publicDir = projectRoot ? join(projectRoot, 'public') : null;
  const publicHandler = publicDir && existsSync(publicDir)
    ? sirv(publicDir, { dev: true })
    : null;

  // Request handler
  const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // CORS headers on all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API routes
    if (url.startsWith('/api/')) {
      try {
        const handled = await handleApiRequest(req, res, c2dDir);
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    // Renders (pre-rendered HTML/screenshots)
    if (url.startsWith('/renders/')) {
      req.url = url.slice('/renders'.length) || '/';
      rendersHandler(req, res, () => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Render not found' }));
      });
      return;
    }

    // Try project's public/ folder (images, fonts, icons, etc.)
    if (publicHandler) {
      publicHandler(req, res, () => {
        // Not found in public/ — fall through to canvas SPA
        canvasHandler(req, res, () => {
          res.writeHead(404);
          res.end('Not found');
        });
      });
      return;
    }

    // Canvas app (SPA with fallback to index.html)
    canvasHandler(req, res, () => {
      res.writeHead(404);
      res.end('Not found');
    });
  };

  // Try ports starting from the configured port
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const tryPort = port + attempt;
    try {
      return await tryListen(requestHandler, tryPort);
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS - 1) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Could not find an available port (tried ${port}-${port + MAX_PORT_ATTEMPTS - 1})`);
}
