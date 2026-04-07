import { useState } from 'react';
import type { PagePlacement } from '../layout/canvas-layout';

interface PagePreviewProps {
  page: PagePlacement;
}

export function PagePreview({ page }: PagePreviewProps) {
  const [isInteractive, setIsInteractive] = useState(false);

  // Render a styled error card when the page status is 'error'
  if (page.status === 'error') {
    const isAppBug = page.error?.includes('client-side error') || page.error?.includes('app itself has a bug');
    const isRedirect = page.error?.includes('redirected');
    const isTimeout = page.error?.includes('Timeout');

    let title = 'Render Error';
    let guide = 'This page could not be rendered by Code to Design.';

    if (isAppBug) {
      title = 'App Code Error';
      guide = 'This page has a JavaScript error in the source code. Open the browser dev console to see the error details, then fix it in your codebase.';
    } else if (isRedirect) {
      title = 'Page Redirect';
      guide = 'This page redirects to another URL during load, so it cannot be captured. Consider using router.push() instead of window.location.href.';
    } else if (isTimeout) {
      title = 'Render Timeout';
      guide = 'This page took too long to load. It may have an infinite loop, a hanging API call, or a very slow resource.';
    }

    return (
      <div
        style={{
          position: 'absolute',
          left: page.x,
          top: page.y,
          width: page.width,
          height: page.height,
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
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div style={{ color: '#991b1b', fontWeight: 700, fontSize: 20 }}>
          {title}
        </div>
        <div style={{ color: '#6b7280', fontSize: 14, fontWeight: 500 }}>
          {page.routePath} [{page.stateName}]
        </div>
        <div style={{ color: '#374151', fontSize: 14, textAlign: 'center', lineHeight: 1.6, maxWidth: 500 }}>
          {guide}
        </div>
        {page.error && (
          <div
            style={{
              color: '#b91c1c',
              fontSize: 12,
              maxWidth: '90%',
              textAlign: 'center',
              wordBreak: 'break-word',
              padding: '12px 16px',
              background: '#fee2e2',
              borderRadius: 6,
              fontFamily: 'monospace',
            }}
          >
            {page.error}
          </div>
        )}
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
        border: '1px solid #e5e7eb',
        borderRadius: 4,
        background: '#fff',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
      onDoubleClick={() => setIsInteractive(true)}
    >
      <iframe
        src={page.htmlUrl}
        title={`${page.routePath} [${page.stateName}]`}
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
  );
}
