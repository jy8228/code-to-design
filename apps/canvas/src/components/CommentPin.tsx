import type { Comment } from '../hooks/useComments';

interface CommentPinProps {
  comment: Comment;
  selected: boolean;
  onClick: () => void;
}

export function CommentPin({ comment, selected, onClick }: CommentPinProps) {
  const initials = (comment.author || 'U').slice(0, 2).toUpperCase();

  return (
    <div
      style={{
        position: 'absolute',
        left: comment.x - 14,
        top: comment.y - 28,
        cursor: 'pointer',
        zIndex: 10,
        pointerEvents: 'auto',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Pin shape */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50% 50% 50% 0',
          background: selected ? '#2563eb' : '#3b82f6',
          transform: 'rotate(-45deg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: selected
            ? '0 2px 8px rgba(37,99,235,0.5)'
            : '0 1px 4px rgba(0,0,0,0.2)',
          transition: 'box-shadow 0.15s, background 0.15s',
        }}
      >
        <span
          style={{
            transform: 'rotate(45deg)',
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {initials}
        </span>
      </div>
    </div>
  );
}
