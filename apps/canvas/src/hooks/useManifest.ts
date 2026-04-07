import { useEffect, useState } from 'react';

// Local copies of manifest types to avoid cross-package imports at runtime.
// These mirror packages/core/src/render/types.ts

export interface ManifestState {
  name: string;
  htmlPath: string;
  screenshotPath: string;
  status: 'ok' | 'error';
  error?: string;
}

export interface ManifestRoute {
  urlPath: string;
  filePath: string;
  states: ManifestState[];
}

export interface RenderManifest {
  generatedAt: string;
  projectName: string;
  routes: ManifestRoute[];
}

interface UseManifestResult {
  manifest: RenderManifest | null;
  loading: boolean;
  error: string | null;
}

export function useManifest(): UseManifestResult {
  const [manifest, setManifest] = useState<RenderManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchManifest() {
      try {
        const res = await fetch('/api/manifest');
        if (!res.ok) {
          throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}`);
        }
        const data: RenderManifest = await res.json();
        if (!cancelled) {
          setManifest(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  return { manifest, loading, error };
}
