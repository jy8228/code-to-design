import { useRef, useState, useEffect, useCallback } from 'react';
import type { PagePlacement, LabelPlacement, CompactPagePlacement } from '../layout/canvas-layout';
import type { Comment } from '../hooks/useComments';
import type { ViewMode } from './Toolbar';
import { PagePreview } from './PagePreview';
import { CompactPagePreview } from './CompactPagePreview';
import { CommentPin } from './CommentPin';
import { CommentPanel } from './CommentPanel';
import { DrawingCanvas } from './DrawingCanvas';
import type { Stroke } from './DrawingCanvas';
import { Toolbar } from './Toolbar';

export type Tool = 'select' | 'comment' | 'draw';

interface InfiniteCanvasProps {
  pages: PagePlacement[];
  compactPages: CompactPagePlacement[];
  labels: LabelPlacement[];
  compactLabels: LabelPlacement[];
  comments: Comment[];
  onAddComment: (comment: Omit<Comment, 'id'>) => Promise<Comment | null>;
  onDeleteComment: (id: string) => Promise<boolean>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function InfiniteCanvas({
  pages,
  compactPages,
  labels,
  compactLabels,
  comments,
  onAddComment,
  onDeleteComment,
  viewMode,
  onViewModeChange,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>('select');
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [savedStrokes, setSavedStrokes] = useState<Stroke[]>([]);

  // Fetch saved drawings on mount
  useEffect(() => {
    fetch('/api/drawings')
      .then(res => res.ok ? res.json() : [])
      .then((data: Stroke[]) => setSavedStrokes(data))
      .catch(() => {});
  }, []);

  // Save drawings when strokes change
  const handleStrokesChange = useCallback((strokes: Stroke[]) => {
    setSavedStrokes(strokes);
    fetch('/api/drawings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(strokes),
    }).catch(() => {});
  }, []);

  // Track container size via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Viewport culling: only render items whose screen-space bbox overlaps the visible area
  const CULL_MARGIN = 200;
  function isPageVisible(item: { x: number; y: number; width: number; height: number }) {
    const sx = item.x * zoom + camera.x;
    const sy = item.y * zoom + camera.y;
    const sw = item.width * zoom;
    const sh = item.height * zoom;
    return (
      sx + sw > -CULL_MARGIN &&
      sx < containerSize.w + CULL_MARGIN &&
      sy + sh > -CULL_MARGIN &&
      sy < containerSize.h + CULL_MARGIN
    );
  }

  // Select the correct layout data based on view mode
  const activePages = viewMode === 'compact' ? compactPages : pages;
  const activeLabels = viewMode === 'compact' ? compactLabels : labels;

  const visiblePages = pages.filter(isPageVisible);
  const visibleCompactPages = compactPages.filter(isPageVisible);
  const visibleLabels = activeLabels.filter(l => isPageVisible({ x: l.x, y: l.y, width: 200, height: 20 }));

  // Zoom to fit all content on mount and when view mode changes
  useEffect(() => {
    if (activePages.length === 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    zoomToFit(rect.width, rect.height);
  }, [activePages.length, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  function zoomToFit(containerW: number, containerH: number) {
    if (activePages.length === 0) return;
    const minX = Math.min(...activePages.map(p => p.x));
    const minY = Math.min(...activeLabels.length > 0 ? activeLabels.map(l => l.y) : activePages.map(p => p.y));
    const maxX = Math.max(...activePages.map(p => p.x + p.width));
    const maxY = Math.max(...activePages.map(p => p.y + p.height));
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 60;
    const fitZoom = clamp(
      Math.min((containerW - padding * 2) / contentW, (containerH - padding * 2) / contentH),
      0.02, 1,
    );
    setZoom(fitZoom);
    setCamera({
      x: containerW / 2 - (minX + contentW / 2) * fitZoom,
      y: containerH / 2 - (minY + contentH / 2) * fitZoom,
    });
  }

  // Wheel: ctrl/meta+wheel = zoom, regular wheel = pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = 1 - e.deltaY * 0.005;
        const newZoom = clamp(zoom * factor, 0.02, 4);
        const rect = el!.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setCamera(cam => ({
          x: mx - (mx - cam.x) * (newZoom / zoom),
          y: my - (my - cam.y) * (newZoom / zoom),
        }));
        setZoom(newZoom);
      } else {
        setCamera(cam => ({ x: cam.x - e.deltaX, y: cam.y - e.deltaY }));
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom]);

  // Pointer handlers for pan and comment placement
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (tool === 'draw') return; // DrawingCanvas handles its own events

    if (tool === 'comment') {
      const rect = containerRef.current!.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - camera.x) / zoom;
      const canvasY = (e.clientY - rect.top - camera.y) / zoom;
      onAddComment({
        x: canvasX,
        y: canvasY,
        text: '',
        author: 'User',
        timestamp: new Date().toISOString(),
      }).then(created => {
        if (created) {
          setSelectedCommentId(created.id);
          setTool('select');
        }
      });
      return;
    }

    // Select tool: pan on drag
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [tool, camera, zoom, onAddComment]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning) {
      setCamera({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(z => clamp(z * 1.3, 0.02, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => clamp(z / 1.3, 0.02, 4));
  }, []);

  const handleZoomToFit = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    zoomToFit(rect.width, rect.height);
  }, [activePages, activeLabels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selected comment data
  const selectedComment = comments.find(c => c.id === selectedCommentId) ?? null;

  // Compute screen position for comment panel
  let panelScreenPos = { x: 0, y: 0 };
  if (selectedComment) {
    panelScreenPos = {
      x: selectedComment.x * zoom + camera.x,
      y: selectedComment.y * zoom + camera.y,
    };
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        cursor: tool === 'comment' ? 'crosshair' : isPanning ? 'grabbing' : 'grab',
        background: '#f8f9fa',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Transformed canvas layer */}
      <div
        style={{
          transformOrigin: '0 0',
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})`,
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        {/* Labels */}
        {visibleLabels.map(label => (
          <div
            key={label.id}
            style={{
              position: 'absolute',
              left: label.x,
              top: label.y,
              fontSize: 14,
              fontWeight: 500,
              color: '#6b7280',
              fontFamily: 'system-ui, sans-serif',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {label.text}
          </div>
        ))}

        {/* Page previews */}
        {viewMode === 'expanded' && visiblePages.map(page => (
          <PagePreview key={page.id} page={page} />
        ))}
        {viewMode === 'compact' && visibleCompactPages.map(page => (
          <CompactPagePreview key={page.id} page={page} />
        ))}

        {/* Comment pins */}
        {comments.map(comment => (
          <CommentPin
            key={comment.id}
            comment={comment}
            selected={comment.id === selectedCommentId}
            onClick={() => {
              if (tool === 'select') {
                setSelectedCommentId(prev => prev === comment.id ? null : comment.id);
              }
            }}
          />
        ))}
      </div>

      {/* Drawing overlay */}
      {tool === 'draw' && (
        <DrawingCanvas
          camera={camera}
          zoom={zoom}
          initialStrokes={savedStrokes}
          onStrokesChange={handleStrokesChange}
        />
      )}

      {/* Comment panel (screen-space overlay) */}
      {selectedComment && (
        <div
          style={{
            position: 'absolute',
            left: panelScreenPos.x,
            top: panelScreenPos.y + 20,
            zIndex: 100,
          }}
        >
          <CommentPanel
            comment={selectedComment}
            onSave={(text) => {
              onAddComment({ ...selectedComment, text });
              setSelectedCommentId(null);
            }}
            onDelete={() => {
              onDeleteComment(selectedComment.id);
              setSelectedCommentId(null);
            }}
            onClose={() => setSelectedCommentId(null)}
          />
        </div>
      )}

      {/* Toolbar */}
      <Toolbar
        tool={tool}
        onToolChange={setTool}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomToFit={handleZoomToFit}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />
    </div>
  );
}
