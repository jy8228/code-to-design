import { useState } from 'react';
import { useManifest } from './hooks/useManifest';
import { useComments } from './hooks/useComments';
import { computeCanvasLayout, computeCompactLayout } from './layout/canvas-layout';
import { InfiniteCanvas } from './components/InfiniteCanvas';
import type { ViewMode } from './components/Toolbar';

export function App() {
  const { manifest, loading, error } = useManifest();
  const { comments, addComment, deleteComment } = useComments();
  const [viewMode, setViewMode] = useState<ViewMode>('expanded');

  if (loading) {
    return (
      <div style={styles.center}>
        <p style={styles.statusText}>Loading manifest...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <p style={styles.errorText}>Error: {error}</p>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div style={styles.center}>
        <p style={styles.statusText}>No manifest found.</p>
      </div>
    );
  }

  const layout = computeCanvasLayout(manifest.routes);
  const compactLayout = computeCompactLayout(manifest.routes);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>Code to Design</span>
        <span style={styles.projectName}>{manifest.projectName}</span>
        <span style={styles.routeCount}>
          {manifest.routes.length} routes
        </span>
      </div>

      {/* Canvas */}
      <div style={styles.canvasWrapper}>
        <InfiniteCanvas
          pages={layout.pages}
          compactPages={compactLayout.pages}
          labels={layout.labels}
          compactLabels={compactLayout.labels}
          comments={comments}
          onAddComment={addComment}
          onDeleteComment={deleteComment}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    height: 44,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 16px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
    flexShrink: 0,
  },
  logo: {
    fontWeight: 700,
    fontSize: 15,
    color: '#111827',
    fontFamily: 'system-ui, sans-serif',
  },
  projectName: {
    fontSize: 13,
    color: '#6b7280',
    fontFamily: 'system-ui, sans-serif',
  },
  routeCount: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 'auto',
    fontFamily: 'system-ui, sans-serif',
  },
  canvasWrapper: {
    flex: 1,
    position: 'relative',
  },
  center: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: '#6b7280',
    fontFamily: 'system-ui, sans-serif',
  },
  errorText: {
    color: '#ef4444',
    fontFamily: 'system-ui, sans-serif',
  },
};
