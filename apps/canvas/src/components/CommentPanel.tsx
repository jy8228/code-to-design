import React, { useState } from 'react';
import type { Comment } from '../hooks/useComments';

interface CommentPanelProps {
  comment: Comment;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function CommentPanel({ comment, onSave, onDelete, onClose }: CommentPanelProps) {
  const [text, setText] = useState(comment.text);
  const [editing, setEditing] = useState(!comment.text);

  const handleSave = () => {
    if (text.trim()) {
      onSave(text.trim());
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      style={{
        width: 280,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        border: '1px solid #e5e7eb',
        zIndex: 1000,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, color: '#374151' }}>
          {comment.author}
        </span>
        <span style={{ color: '#9ca3af', fontSize: 11 }}>
          {new Date(comment.timestamp).toLocaleString()}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: 12 }}>
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment..."
            autoFocus
            style={{
              width: '100%',
              minHeight: 60,
              border: '1px solid #d1d5db',
              borderRadius: 4,
              padding: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <p
            style={{ margin: 0, color: '#374151', lineHeight: 1.5, cursor: 'pointer' }}
            onClick={() => setEditing(true)}
          >
            {comment.text || 'Click to add a comment...'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <button
          onClick={onDelete}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            background: 'none',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            color: '#ef4444',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: 'none',
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#6b7280',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          {editing && (
            <button
              onClick={handleSave}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                background: '#3b82f6',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
