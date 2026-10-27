'use client';

import { useState } from 'react';
import { CheckCircle2, MessageSquare, Send, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ConfirmationProps {
  reportId?: string;
  initialVoteCount?: number;
  initialUserVote?: number;
  confirmationCount?: number;
}

export function ConfirmationsBadge({ confirmationCount = 0 }: { confirmationCount: number }) {
  return (
    <div className="w-full py-3.5 rounded-xl border border-white/10 bg-white/5 font-display font-bold text-[11px] uppercase tracking-widest text-cyan flex items-center justify-center gap-2">
      <CheckCircle2 className="w-4 h-4 text-cyan" />
      {confirmationCount} Confirmation{confirmationCount !== 1 ? 's' : ''}
    </div>
  );
}

// Deprecated alias for backwards compatibility during migration; displays confirmations count without voting
export function VoteButton({ initialVoteCount = 0, confirmationCount }: ConfirmationProps) {
  const count = confirmationCount ?? initialVoteCount;
  return <ConfirmationsBadge confirmationCount={count} />;
}

interface CommentItem {
  id: string;
  text: string;
  createdAt: string;
  user: { name: string | null; email: string };
}

export function CommentSection({ reportId }: { reportId: string }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const router = useRouter();

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/reports/${reportId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (e) {
      console.error('Fetch comments failed:', e);
    }
  };

  const handleToggleComments = () => {
    const nextState = !showComments;
    setShowComments(nextState);
    if (nextState) {
      void fetchComments();
    }
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        setText('');
        void fetchComments();
        router.refresh();
      }
    } catch (e) {
      console.error('Comment failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <button 
        onClick={handleToggleComments}
        className="w-full py-3.5 rounded-xl bg-white/5 border border-white/5 text-[10px] font-mono uppercase tracking-widest font-bold text-white/40 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        {showComments ? 'Hide Intelligence' : 'View Intelligence'} ({comments.length})
      </button>

      {showComments && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
          {/* Comment Input */}
          <div className="flex gap-3">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Add intelligence..."
              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm font-body outline-none focus:border-cyan focus:ring-1 focus:ring-cyan/50 transition-all"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !text.trim()}
              className="px-5 py-3 rounded-xl bg-cyan text-black hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          {/* Comments Feed */}
          <div className="space-y-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
            {comments.length === 0 ? (
              <p className="text-center text-white/30 text-[10px] font-mono uppercase tracking-widest py-6">No intelligence gathered yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="p-5 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-cyan">{c.user.name || c.user.email.split('@')[0]}</span>
                    <span className="text-[9px] font-mono text-white/30">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm font-body text-slate-300 leading-relaxed">{c.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
