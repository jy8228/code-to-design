import { useCallback, useEffect, useRef, useState } from 'react';

export interface Comment {
  id: string;
  x: number;
  y: number;
  text: string;
  author: string;
  timestamp: string;
}

interface UseCommentsResult {
  comments: Comment[];
  loading: boolean;
  addComment: (comment: Omit<Comment, 'id'>) => Promise<Comment | null>;
  deleteComment: (id: string) => Promise<boolean>;
  refresh: () => void;
}

export function useComments(): UseCommentsResult {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const isMutating = useRef(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch('/api/comments');
      if (res.ok) {
        const data: Comment[] = await res.json();
        setComments(data);
      }
    } catch {
      // Silently fail — comments are non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Poll for new comments every 5 seconds (skip while mutating)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isMutating.current) {
        fetchComments();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  const addComment = useCallback(
    async (comment: Omit<Comment, 'id'>): Promise<Comment | null> => {
      isMutating.current = true;
      try {
        const res = await fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(comment),
        });
        if (res.ok) {
          const created: Comment = await res.json();
          setComments((prev) => [...prev, created]);
          return created;
        }
      } catch {
        // Silently fail
      } finally {
        isMutating.current = false;
      }
      return null;
    },
    []
  );

  const deleteComment = useCallback(async (id: string): Promise<boolean> => {
    isMutating.current = true;
    try {
      const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== id));
        return true;
      }
    } catch {
      // Silently fail
    } finally {
      isMutating.current = false;
    }
    return false;
  }, []);

  return { comments, loading, addComment, deleteComment, refresh: fetchComments };
}
