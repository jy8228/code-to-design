import type { Tool } from './InfiniteCanvas';

export type ViewMode = 'expanded' | 'compact';

interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function Toolbar({
  tool,
  onToolChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  viewMode,
  onViewModeChange,
}: ToolbarProps) {
  return (
    <div style={styles.container} onPointerDown={e => e.stopPropagation()}>
      {/* Tool buttons */}
      <div style={styles.group}>
        <ToolButton
          active={tool === 'select'}
          onClick={() => onToolChange('select')}
          title="Select (V)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 1l10 6-4 1.5L6.5 13z" />
          </svg>
        </ToolButton>
        <ToolButton
          active={tool === 'comment'}
          onClick={() => onToolChange('comment')}
          title="Comment (C)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2h12v9H5l-3 3V2z" />
          </svg>
        </ToolButton>
        <ToolButton
          active={tool === 'draw'}
          onClick={() => onToolChange('draw')}
          title="Draw (D)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.1 1.3a1.5 1.5 0 012.1 2.1L5.5 12.1l-3 .8.8-3z" />
          </svg>
        </ToolButton>
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Zoom controls */}
      <div style={styles.group}>
        <ToolButton onClick={onZoomOut} title="Zoom out">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 7h10v2H3z" />
          </svg>
        </ToolButton>
        <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <ToolButton onClick={onZoomIn} title="Zoom in">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7 3v4H3v2h4v4h2V9h4V7H9V3z" />
          </svg>
        </ToolButton>
        <ToolButton onClick={onZoomToFit} title="Zoom to fit">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2h4v1.5H3.5V6H2V2zm8 0h4v4h-1.5V3.5H10V2zM2 10h1.5v2.5H6V14H2v-4zm10.5 2.5V10H14v4h-4v-1.5h2.5z" />
          </svg>
        </ToolButton>
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* View mode toggle */}
      <div style={styles.group}>
        <ToolButton
          active={viewMode === 'expanded'}
          onClick={() => onViewModeChange('expanded')}
          title="Expanded view"
        >
          {/* Grid icon */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
        </ToolButton>
        <ToolButton
          active={viewMode === 'compact'}
          onClick={() => onViewModeChange('compact')}
          title="Compact view"
        >
          {/* Compact/list icon */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="14" height="3" rx="1" />
            <rect x="1" y="6.5" width="14" height="3" rx="1" />
            <rect x="1" y="12" width="14" height="3" rx="1" />
          </svg>
        </ToolButton>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        ...styles.button,
        ...(active ? styles.buttonActive : {}),
      }}
    >
      {children}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '4px 6px',
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    border: '1px solid #e5e7eb',
    zIndex: 50,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    height: 20,
    background: '#e5e7eb',
    margin: '0 4px',
  },
  button: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    borderRadius: 6,
    cursor: 'pointer',
    color: '#6b7280',
    transition: 'background 0.1s, color 0.1s',
  },
  buttonActive: {
    background: '#eff6ff',
    color: '#2563eb',
  },
  zoomLabel: {
    fontSize: 11,
    color: '#9ca3af',
    minWidth: 36,
    textAlign: 'center' as const,
    fontFamily: 'system-ui, sans-serif',
    fontVariantNumeric: 'tabular-nums',
  },
};
