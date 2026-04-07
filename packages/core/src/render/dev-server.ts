import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

/**
 * Find a free port on the system.
 */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not find free port')));
      }
    });
    server.on('error', reject);
  });
}

/**
 * Wait for a URL to become reachable.
 */
async function waitForUrl(url: string, timeoutMs: number = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      // Any response (even redirects) means the server is up
      if (response.status > 0) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not become ready at ${url} within ${timeoutMs}ms`);
}

/**
 * Detect the dev command for a project.
 */
function detectDevCommand(projectRoot: string): { cmd: string; args: string[] } {
  if (existsSync(join(projectRoot, 'next.config.ts')) ||
      existsSync(join(projectRoot, 'next.config.js')) ||
      existsSync(join(projectRoot, 'next.config.mjs'))) {
    return { cmd: 'npx', args: ['next', 'dev'] };
  }
  // Fallback to npm run dev
  return { cmd: 'npm', args: ['run', 'dev'] };
}

export interface DevServerHandle {
  url: string;
  port: number;
  process: ChildProcess | null;
  stop: () => Promise<void>;
}

/**
 * Start a dev server for the target project.
 *
 * If devServerUrl is provided, uses that instead of starting a new server.
 */
export async function startDevServer(
  projectRoot: string,
  options?: { port?: number; devServerUrl?: string },
): Promise<DevServerHandle> {
  // If a URL is provided, use it directly (user has server running)
  if (options?.devServerUrl) {
    await waitForUrl(options.devServerUrl, 10000);
    return {
      url: options.devServerUrl,
      port: 0,
      process: null,
      stop: async () => {},
    };
  }

  const port = options?.port ?? await findFreePort();
  const { cmd, args } = detectDevCommand(projectRoot);
  const fullArgs = [...args, '--port', String(port)];

  const child = spawn(cmd, fullArgs, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) },
  });

  const url = `http://localhost:${port}`;

  // Collect stderr for error reporting
  let stderr = '';
  child.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  // Handle early exit
  const exitPromise = new Promise<never>((_, reject) => {
    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`Dev server exited with code ${code}.\n${stderr.slice(-500)}`));
      }
    });
  });

  // Wait for server to be ready or fail
  try {
    await Promise.race([
      waitForUrl(url, 60000),
      exitPromise,
    ]);
  } catch (err) {
    child.kill('SIGTERM');
    throw err;
  }

  return {
    url,
    port,
    process: child,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 5000);
          child.on('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
  };
}
