import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, MessageSquare, Send, Reply, Trash2 } from 'lucide-react';

interface Comment {
  id: number;
  file_id: number;
  user_id: number;
  user_real_name: string;
  parent_id: number | null;
  content: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  fileId: number;
  fileName: string;
  open: boolean;
  onClose: () => void;
  onCommentCountChange?: (delta: number) => void;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function getCurrentUserId(): number | null {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub ? parseInt(payload.sub) : null;
  } catch { return null; }
}

export function FileCommentPanel({ fileId, fileName, open, onClose, onCommentCountChange }: Props) {
  const [comments, setComments]     = useState<Comment[]>([]);
  const [isLoading, setLoading]     = useState(false);
  const [input, setInput]           = useState('');
  const [replyTo, setReplyTo]       = useState<Comment | null>(null);
  const [isSending, setIsSending]   = useState(false);
  const inputRef                    = useRef<HTMLTextAreaElement>(null);
  const currentUserId               = getCurrentUserId();

  const loadComments = () => {
    setLoading(true);
    fetch(`/api/social/files/${fileId}/comments`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) loadComments();
    else { setComments([]); setReplyTo(null); setInput(''); }
  }, [open, fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitComment = async () => {
    const content = input.trim();
    if (!content || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/social/files/${fileId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ file_id: fileId, content, parent_id: replyTo?.id ?? null }),
      });
      if (res.ok) {
        setInput('');
        setReplyTo(null);
        loadComments();
        onCommentCountChange?.(1);
      }
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const deleteComment = async (commentId: number) => {
    const res = await fetch(`/api/social/comments/${commentId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) {
      setComments(prev => prev.filter(c => c.id !== commentId));
      onCommentCountChange?.(-1);
    }
  };

  // Build threaded structure: top-level + replies
  const topLevel = comments.filter(c => !c.parent_id);
  const repliesFor = (parentId: number) => comments.filter(c => c.parent_id === parentId);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[580px] max-w-[95vw] h-[75vh] flex flex-col outline-none">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#d2d2d7] flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#34c759]/10 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-[#34c759]" strokeWidth={1.5} />
              </div>
              <Dialog.Title className="text-[15px] font-semibold text-[#1d1d1f]">
                评论 {comments.length > 0 && <span className="text-[#86868b] font-normal">({comments.length})</span>}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                <X className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          {/* File name */}
          <div className="px-6 py-2.5 bg-[#f5f5f7] border-b border-[#d2d2d7] flex-shrink-0">
            <p className="text-[12px] text-[#86868b] truncate">{fileName}</p>
          </div>

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <svg className="animate-spin w-6 h-6 text-[#0071e3]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            ) : topLevel.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <MessageSquare className="w-10 h-10 text-[#d2d2d7]" strokeWidth={1} />
                <p className="text-[13px] text-[#86868b]">暂无评论，发表第一条评论吧</p>
              </div>
            ) : (
              topLevel.map(comment => (
                <div key={comment.id}>
                  {/* Top-level comment */}
                  <div className="group">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0 text-[12px] font-medium text-[#0071e3]">
                        {(comment.user_real_name || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-medium text-[#1d1d1f]">{comment.user_real_name || '未知用户'}</span>
                          <span className="text-[11px] text-[#86868b]">{formatTime(comment.created_at)}</span>
                        </div>
                        <p className="text-[13px] text-[#1d1d1f] leading-relaxed break-words">{comment.content}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <button
                            onClick={() => { setReplyTo(comment); inputRef.current?.focus(); }}
                            className="flex items-center gap-1 text-[12px] text-[#86868b] hover:text-[#0071e3] transition-colors"
                          >
                            <Reply className="w-3.5 h-3.5" strokeWidth={1.5} />
                            回复
                          </button>
                          {comment.user_id === currentUserId && (
                            <button
                              onClick={() => deleteComment(comment.id)}
                              className="flex items-center gap-1 text-[12px] text-[#86868b] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              删除
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Replies */}
                  {repliesFor(comment.id).map(reply => (
                    <div key={reply.id} className="ml-11 mt-3 group">
                      <div className="flex items-start gap-3 bg-[#f5f5f7] rounded-xl px-3 py-2.5">
                        <div className="w-6 h-6 rounded-full bg-[#86868b]/10 flex items-center justify-center flex-shrink-0 text-[11px] font-medium text-[#86868b]">
                          {(reply.user_real_name || '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[12px] font-medium text-[#1d1d1f]">{reply.user_real_name || '未知用户'}</span>
                            <span className="text-[11px] text-[#86868b]">{formatTime(reply.created_at)}</span>
                          </div>
                          <p className="text-[12px] text-[#1d1d1f] leading-relaxed break-words">{reply.content}</p>
                          {reply.user_id === currentUserId && (
                            <button
                              onClick={() => deleteComment(reply.id)}
                              className="flex items-center gap-1 text-[11px] text-[#86868b] hover:text-red-500 transition-colors mt-1 opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                              删除
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-[#d2d2d7] px-6 py-4 space-y-2">
            {replyTo && (
              <div className="flex items-center gap-2 text-[12px] text-[#86868b] bg-[#f5f5f7] rounded-lg px-3 py-1.5">
                <Reply className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>回复 <span className="font-medium text-[#1d1d1f]">{replyTo.user_real_name}</span></span>
                <button onClick={() => setReplyTo(null)} className="ml-auto hover:text-[#1d1d1f]">
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 bg-[#f5f5f7] rounded-xl px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                placeholder="输入评论，Enter 发送，Shift+Enter 换行"
                rows={1}
                className="flex-1 bg-transparent text-[13px] text-[#1d1d1f] placeholder-[#86868b] resize-none outline-none leading-relaxed max-h-24 overflow-y-auto"
                style={{ minHeight: '20px' }}
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }}
              />
              <button
                onClick={submitComment}
                disabled={!input.trim() || isSending}
                className="w-7 h-7 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5 text-white" strokeWidth={2} />
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
