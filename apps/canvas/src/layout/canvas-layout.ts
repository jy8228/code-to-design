import type { ManifestRoute } from '../hooks/useManifest';

/**
 * Layout configuration for the canvas grid.
 */
const PAGE_WIDTH = 1440;
const PAGE_HEIGHT = 900;
const COL_GAP = 100; // horizontal gap between pages in a row
const ROW_GAP = 200; // vertical gap between route rows
const LABEL_HEIGHT = 40; // space reserved above each page for the text label

/**
 * Preferred column ordering for state variants.
 * States not in this list appear at the end in their original order.
 */
const STATE_ORDER = ['success', 'empty', 'error', 'loading'];

export interface PagePlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  htmlUrl: string;
  routePath: string;
  stateName: string;
  status: 'ok' | 'error';
  error?: string;
}

export interface LabelPlacement {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface CanvasLayout {
  pages: PagePlacement[];
  labels: LabelPlacement[];
}

function stateSort(a: string, b: string): number {
  const ai = STATE_ORDER.indexOf(a);
  const bi = STATE_ORDER.indexOf(b);
  const aOrder = ai === -1 ? STATE_ORDER.length : ai;
  const bOrder = bi === -1 ? STATE_ORDER.length : bi;
  return aOrder - bOrder;
}

/**
 * Compute grid positions for all pages in the manifest.
 *
 * Layout:
 * - Each route occupies a row.
 * - Within a row, states are columns sorted by STATE_ORDER.
 * - Pages are spaced with COL_GAP / ROW_GAP.
 * - Text labels are placed above each page.
 */
export interface CompactPagePlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  routePath: string;
  states: Array<{
    name: string;
    htmlUrl: string;
    status: 'ok' | 'error';
    error?: string;
  }>;
  activeStateName: string; // currently shown state
}

export interface CompactCanvasLayout {
  pages: CompactPagePlacement[];
  labels: LabelPlacement[];
}

/**
 * Compact layout: one card per route with all states available via dropdown.
 * Grid: 3 columns, 100px horizontal gap, 200px vertical gap.
 */
export function computeCompactLayout(routes: ManifestRoute[]): CompactCanvasLayout {
  const COMPACT_COLS = 3;
  const pages: CompactPagePlacement[] = [];
  const labels: LabelPlacement[] = [];

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const col = i % COMPACT_COLS;
    const row = Math.floor(i / COMPACT_COLS);
    const x = col * (PAGE_WIDTH + COL_GAP);
    const y = row * (LABEL_HEIGHT + PAGE_HEIGHT + ROW_GAP);

    const sortedStates = [...route.states].sort((a, b) =>
      stateSort(a.name, b.name)
    );

    // Default to "success" if available, otherwise first state
    const defaultState =
      sortedStates.find(s => s.name === 'success') ?? sortedStates[0];

    const pageId = `compact::${route.urlPath}`;

    pages.push({
      id: pageId,
      x,
      y: y + LABEL_HEIGHT,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      routePath: route.urlPath,
      states: sortedStates.map(s => ({
        name: s.name,
        htmlUrl: `/${s.htmlPath}`,
        status: s.status,
        error: s.error,
      })),
      activeStateName: defaultState.name,
    });

    labels.push({
      id: `label::${pageId}`,
      x,
      y,
      text: route.urlPath,
    });
  }

  return { pages, labels };
}

export function computeCanvasLayout(routes: ManifestRoute[]): CanvasLayout {
  const pages: PagePlacement[] = [];
  const labels: LabelPlacement[] = [];

  let rowY = 0;

  for (const route of routes) {
    const sortedStates = [...route.states].sort((a, b) =>
      stateSort(a.name, b.name)
    );

    for (let col = 0; col < sortedStates.length; col++) {
      const state = sortedStates[col];
      const x = col * (PAGE_WIDTH + COL_GAP);
      const y = rowY + LABEL_HEIGHT;

      const pageId = `${route.urlPath}::${state.name}`;

      pages.push({
        id: pageId,
        x,
        y,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        htmlUrl: `/${state.htmlPath}`,
        routePath: route.urlPath,
        stateName: state.name,
        status: state.status,
        error: state.error,
      });

      labels.push({
        id: `label::${pageId}`,
        x,
        y: rowY,
        text: `${route.urlPath} / ${state.name}`,
      });
    }

    rowY += LABEL_HEIGHT + PAGE_HEIGHT + ROW_GAP;
  }

  return { pages, labels };
}
