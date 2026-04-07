import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface VibeCanvasConfig {
  apiKey: string;
  port: number;
  excludeRoutes: string[];
  devServerUrl?: string;
  devServerCommand?: string;
}

const DEFAULT_PORT = 4800;

/**
 * Load configuration from environment variables and optional config file.
 */
export async function loadConfig(projectRoot: string): Promise<VibeCanvasConfig> {
  let fileConfig: Partial<VibeCanvasConfig> = {};

  // Try to load c2d.config.js
  const configPath = join(projectRoot, 'c2d.config.js');
  if (existsSync(configPath)) {
    try {
      const mod = await import(configPath);
      fileConfig = mod.default || mod;
    } catch {
      // Config file exists but can't be loaded — use defaults
    }
  }

  const apiKey = process.env.C2D_API_KEY || fileConfig.apiKey || '';

  return {
    apiKey,
    port: fileConfig.port || Number(process.env.C2D_PORT) || DEFAULT_PORT,
    excludeRoutes: fileConfig.excludeRoutes || [],
    devServerUrl: fileConfig.devServerUrl || process.env.C2D_DEV_SERVER_URL,
    devServerCommand: fileConfig.devServerCommand,
  };
}

export interface DetectedProject {
  isSupported: boolean;
  projectType: 'nextjs-app' | 'nextjs-pages' | 'react-router' | 'unknown';
  appDir: string | null;
  projectRoot: string;
  projectName: string;
}

/**
 * Detect the project type and routing convention.
 *
 * Supports Next.js (App Router & Pages Router) and React Router (Vite).
 */
export async function detectProject(projectRoot: string): Promise<DetectedProject> {
  let projectName = 'unknown';
  try {
    const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
    projectName = pkg.name || 'unknown';
  } catch {
    // No package.json
  }

  // Check for Next.js first
  const hasNextConfig =
    existsSync(join(projectRoot, 'next.config.ts')) ||
    existsSync(join(projectRoot, 'next.config.js')) ||
    existsSync(join(projectRoot, 'next.config.mjs'));

  if (hasNextConfig) {
    // Check App Router first, then Pages Router as fallback
    // Priority: app/ → src/app/ → pages/ → src/pages/
    let appDir = join(projectRoot, 'app');
    let hasAppDir = existsSync(appDir);
    if (!hasAppDir) {
      appDir = join(projectRoot, 'src', 'app');
      hasAppDir = existsSync(appDir);
    }

    if (hasAppDir) {
      return { isSupported: true, projectType: 'nextjs-app', appDir, projectRoot, projectName };
    }

    appDir = join(projectRoot, 'pages');
    hasAppDir = existsSync(appDir);
    if (!hasAppDir) {
      appDir = join(projectRoot, 'src', 'pages');
      hasAppDir = existsSync(appDir);
    }

    if (hasAppDir) {
      return { isSupported: true, projectType: 'nextjs-pages', appDir, projectRoot, projectName };
    }

    // Has next config but no recognized directory
    return { isSupported: false, projectType: 'unknown', appDir: null, projectRoot, projectName };
  }

  // Check for React Router (commonly used with Vite)
  try {
    const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ('react-router-dom' in deps || 'react-router' in deps) {
      return { isSupported: true, projectType: 'react-router', appDir: null, projectRoot, projectName };
    }
  } catch {
    // No package.json or can't parse
  }

  return { isSupported: false, projectType: 'unknown', appDir: null, projectRoot, projectName };
}

/**
 * Detect if the current directory is a Next.js App Router project.
 * @deprecated Use `detectProject` instead, which also supports React Router.
 */
export async function detectNextJsProject(projectRoot: string): Promise<{
  isNextJs: boolean;
  appDir: string | null;
  projectName: string;
}> {
  const result = await detectProject(projectRoot);
  return {
    isNextJs: result.projectType === 'nextjs-app' || result.projectType === 'nextjs-pages',
    appDir: result.appDir,
    projectName: result.projectName,
  };
}
