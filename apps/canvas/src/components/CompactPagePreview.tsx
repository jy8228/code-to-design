import { useState } from 'react';
import type { CompactPagePlacement } from '../layout/canvas-layout';

interface CompactPagePreviewProps {
  page: CompactPagePlacement;
}

export function CompactPagePreview({ page }: CompactPagePreviewProps) {
  const [activeState, setActiveState] = useState(page.activeStateName);
  const [isInteractive, setIsInteractive] = useState(false);

  const currentState = page.states.find(s => s.name === activeState) ?? page.states[0];

  // Render error card when current state has an error
  if (currentState.status === 'error') {
    const errorMsg = currentState.error || '';
    const isAppBug = errorMsg.includes('client-side error') || errorMsg.includes('app itself has a bug');
    const isRedirect = errorMsg.includes('redirected');
    const isTimeout = errorMsg.includes('Timeout');

    let title = 'Render Error';
    let guide = 'This page could not be rendered.';
    if (isAppBug) {
      title = 'App Code Error';
      guide = 'This page has a JavaScript error in the source code. Check browser dev console for details.';
    } else if (isRedirect) {
      title = 'Page Redirect';
      guide = 'This page redirects during load and cannot be captured.';
    } else if (isTimeout) {
      title = 'Render Timeout';
      guide = 'This page took too long to load.';
    }

    return (
      <div style={{ position: 'absolute', left: page.x, top: page.y, width: page.width, height: page.height }}>
        <StatePills states={page.states} activeState={activeState} onChange={setActiveState} />
        <div
          style={{
            width: page.width,
            height: page.height - PILL_BAR_HEIGHT,
            marginTop: PILL_BAR_HEIGHT,
            border: '1px solid #fca5a5',
            borderRadius: 4,
            background: '#fef2f2',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 40,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div style={{ color: '#991b1b', fontWeight: 700, fontSize: 18 }}>{title}</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>{page.routePath} [{currentState.name}]</div>
          <div style={{ color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 1.5, maxWidth: 400 }}>{guide}</div>
          {errorMsg && (
            <div style={{ color: '#b91c1c', fontSize: 11, maxWidth: '90%', textAlign: 'center', wordBreak: 'break-word', padding: '8px 12px', background: '#fee2e2', borderRadius: 6, fontFamily: 'monospace' }}>
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: page.x,
        top: page.y,
        width: page.width,
        height: page.height,
      }}
    >
      <StatePills
        states={page.states}
        activeState={activeState}
        onChange={setActiveState}
      />
      <div
        style={{
          width: page.width,
          height: page.height - PILL_BAR_HEIGHT,
          marginTop: PILL_BAR_HEIGHT,
          border: '1px solid #e5e7eb',
          borderRadius: 4,
          background: '#fff',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
        onDoubleClick={() => setIsInteractive(true)}
      >
        <iframe
          src={currentState.htmlUrl}
          title={`${page.routePath} [${activeState}]`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            pointerEvents: isInteractive ? 'auto' : 'none',
          }}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
        />
      </div>
    </div>
  );
}

const PILL_BAR_HEIGHT = 28;

function StatePills({
  states,
  activeState,
  onChange,
}: {
  states: CompactPagePreviewProps['page']['states'];
  activeState: string;
  onChange: (name: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        height: PILL_BAR_HEIGHT,
        alignItems: 'center',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {states.map(state => {
        const isActive = state.name === activeState;
        return (
          <button
            key={state.name}
            onClick={() => onChange(state.name)}
            style={{
              padding: '2px 10px',
              fontSize: 11,
              fontFamily: 'system-ui, sans-serif',
              fontWeight: isActive ? 600 : 400,
              border: '1px solid',
              borderColor: isActive ? '#2563eb' : '#d1d5db',
              borderRadius: 999,
              background: isActive ? '#eff6ff' : '#fff',
              color: isActive ? '#2563eb' : '#6b7280',
              cursor: 'pointer',
              lineHeight: '18px',
              whiteSpace: 'nowrap',
              transition: 'background 0.1s, color 0.1s, border-color 0.1s',
            }}
          >
            {state.name}
          </button>
        );
      })}
    </div>
  );
}
