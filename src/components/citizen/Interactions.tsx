'use client';

import { useState, useEffect } from 'react';
import { ThumbsUp, MessageSquare, Send, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  reportId: string;
  initialVoteCount: number;
  initialUserVote: number; // 1, -1, or 0
}

export function VoteButton({ reportId, initialVoteCount, initialUserVote }: Props) {
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [userVote, setUserVote] = useState(initialUserVote);
  const [loading, setLoading] = useState(false);

  const handleVote = async () => {
    setLoading(true);
    const newValue = userVote === 1 ? 0 : 1;
    try {
      const res = await fetch(`/api/reports/${reportId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue === 0 ? -1 : 1 })
      });
      if (res.ok) {
        setUserVote(newValue);
        setVoteCount(prev => newValue === 1 ? prev + 1 : Math.max(0, prev - 1));
      }
    } catch (e) {
      console.error('Vote failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleVote}
      disabled={loading}
      className={`w-full py-3.5 rounded-xl border font-display font-bold text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
        userVote === 1 
          ? 'bg-cyan border-cyan text-black shadow-lg shadow-cyan/20' 
          : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white'
      }`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
      {voteCount} Upvote{voteCount !== 1 ? 's' : ''}
    </button>
  );
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

  useEffect(() => {
    if (showComments) fetchComments();
  }, [showComments]);

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
        fetchComments();
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
        onClick={() => setShowComments(!showComments)}
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
