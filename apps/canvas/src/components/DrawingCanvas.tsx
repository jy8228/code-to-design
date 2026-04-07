import { useRef, useEffect, useState, useCallback } from 'react';

export interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface DrawingCanvasProps {
  camera: { x: number; y: number };
  zoom: number;
  initialStrokes?: Stroke[];
  onStrokesChange?: (strokes: Stroke[]) => void;
}

export function DrawingCanvas({ camera, zoom, initialStrokes, onStrokesChange }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes ?? []);
  const initializedRef = useRef(false);

  // Sync when initialStrokes prop changes (e.g. after fetch completes)
  useEffect(() => {
    if (initialStrokes && !initializedRef.current) {
      setStrokes(initialStrokes);
      initializedRef.current = true;
    }
  }, [initialStrokes]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Convert screen coords to canvas space
  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const el = canvasRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return {
        x: (clientX - rect.left - camera.x) / zoom,
        y: (clientY - rect.top - camera.y) / zoom,
      };
    },
    [camera, zoom],
  );

  // Redraw all strokes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width / zoom; // Scale line width
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const first = stroke.points[0];
      ctx.moveTo(first.x * zoom + camera.x, first.y * zoom + camera.y);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        ctx.lineTo(pt.x * zoom + camera.x, pt.y * zoom + camera.y);
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke, camera, zoom]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const pt = toCanvasCoords(e.clientX, e.clientY);
      setIsDrawing(true);
      setCurrentStroke({
        points: [pt],
        color: '#ef4444',
        width: 2,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [toCanvasCoords],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing || !currentStroke) return;
      const pt = toCanvasCoords(e.clientX, e.clientY);
      setCurrentStroke(prev =>
        prev ? { ...prev, points: [...prev.points, pt] } : null,
      );
    },
    [isDrawing, currentStroke, toCanvasCoords],
  );

  const handlePointerUp = useCallback(() => {
    if (currentStroke && currentStroke.points.length >= 2) {
      setStrokes(prev => {
        const updated = [...prev, currentStroke];
        onStrokesChange?.(updated);
        return updated;
      });
    }
    setCurrentStroke(null);
    setIsDrawing(false);
  }, [currentStroke, onStrokesChange]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        zIndex: 20,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
