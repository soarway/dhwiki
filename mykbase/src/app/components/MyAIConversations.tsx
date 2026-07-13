import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="px-1 py-0.5 bg-[#e8e8ed] rounded text-[12px] font-mono">{part.slice(1, -1)}</code>;
    return part;
  });
}

function MarkdownBlock({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (/^\d+\.\s/.test(block)) {
          const items = block.split(/\n(?=\d+\.\s)/);
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {items.map((item, j) => (
                <li key={j} className="leading-relaxed">{renderInline(item.replace(/^\d+\.\s+/, ''))}</li>
              ))}
            </ol>
          );
        }
        if (/^[-*]\s/.test(block)) {
          const items = block.split(/\n(?=[-*]\s)/);
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items.map((item, j) => (
                <li key={j} className="leading-relaxed">{renderInline(item.replace(/^[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        if (/^#{1,3}\s/.test(block)) {
          return <p key={i} className="font-semibold leading-relaxed">{renderInline(block.replace(/^#+\s+/, ''))}</p>;
        }
        return (
          <p key={i} className="leading-relaxed">
            {block.split('\n').flatMap((line, j, arr) =>
              j < arr.length - 1 ? [renderInline(line), <br key={`br-${j}`} />] : [renderInline(line)]
            )}
          </p>
        );
      })}
    </div>
  );
}

interface ConvSummary {
  id: number;
  title: string | null;
  created_at: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return `今天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays === 1) return `昨天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function MyAIConversations() {
  const [convs, setConvs] = useState<ConvSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 加载会话列表
  useEffect(() => {
    fetch('/api/chat/conversations', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: ConvSummary[]) => {
        setConvs(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, []);

  // 切换会话时加载消息
  useEffect(() => {
    if (selectedId === null) return;
    setLoadingMsgs(true);
    setMessages([]);
    fetch(`/api/chat/conversations/${selectedId}/messages`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: ChatMessage[]) => setMessages(data))
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [selectedId]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedConv = convs.find(c => c.id === selectedId) ?? null;

  const handleNewConversation = async () => {
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title: '新会话' }),
    });
    if (!res.ok) return;
    const newConv: ConvSummary = await res.json();
    setConvs(prev => [newConv, ...prev]);
    setSelectedId(newConv.id);
    setMessages([]);
  };

  const handleDeleteConv = async (id: number) => {
    await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE', headers: authHeaders() });
    setConvs(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setMessages([]);
    }
    setDeletingId(null);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedId || isSending) return;
    const text = input.trim();
    setInput('');
    setIsSending(true);

    // 乐观追加用户消息
    const tmpUserMsg: ChatMessage = { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
    const tmpAiMsg: ChatMessage = { id: Date.now() + 1, role: 'assistant', content: '', created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tmpUserMsg, tmpAiMsg]);

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`/api/chat/conversations/${selectedId}/ask-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ question: text }),
        signal: abortRef.current.signal,
      });
      if (!res.body) throw new Error('no body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') break;
          try {
            const obj = JSON.parse(data);
            if (obj.token) {
              aiContent += obj.token;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { ...copy[copy.length - 1], content: aiContent };
                return copy;
              });
            }
          } catch { /* ignore */ }
        }
      }

      // 更新会话列表中的标题（首次问答取问题前20字作标题）
      if (selectedConv?.title === '新会话') {
        const newTitle = text.slice(0, 20);
        setConvs(prev => prev.map(c => c.id === selectedId ? { ...c, title: newTitle } : c));
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: '请求失败，请重试。' };
          return copy;
        });
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
    <div className="size-full flex overflow-hidden">
      {/* Left: Conversation List */}
      <div className="w-[260px] border-r border-[#d2d2d7] bg-[#fbfbfd] flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-[#d2d2d7]">
          <button
            onClick={handleNewConversation}
            className="w-full px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg transition-all flex items-center justify-center gap-2 text-[14px] font-medium"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            新建会话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : convs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#86868b]">
              <MessageCircle className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
              <p className="text-[13px]">暂无会话记录</p>
            </div>
          ) : (
            convs.map(conv => (
              <div
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`group px-4 py-3 cursor-pointer border-b border-[#d2d2d7]/40 hover:bg-[#f0f0f5] transition-colors flex items-start gap-2 ${selectedId === conv.id ? 'bg-[#f0f0f5] border-l-2 border-l-[#0071e3]' : ''}`}
              >
                <MessageCircle className="w-4 h-4 text-[#0071e3] mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{conv.title || '新会话'}</p>
                  <p className="text-[12px] text-[#86868b] mt-0.5">{formatDate(conv.created_at)}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setDeletingId(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 transition-all flex-shrink-0 mt-0.5"
                  title="删除会话"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" strokeWidth={1.5} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Chat Area */}
      <div className="flex-1 flex flex-col bg-white min-w-0">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center px-6 flex-shrink-0">
              <Sparkles className="w-5 h-5 text-[#0071e3] mr-2" strokeWidth={1.5} />
              <h1 className="text-[17px] font-semibold text-[#1d1d1f] truncate">{selectedConv.title || '新会话'}</h1>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {loadingMsgs ? (
                <div className="flex justify-center py-20">
                  <div className="w-6 h-6 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-[#0071e3]/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-[#0071e3]" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-[17px] font-semibold text-[#1d1d1f] mb-2">开始提问</h3>
                  <p className="text-[14px] text-[#86868b]">向 AI 提出你的问题，获得智能回答。</p>
                </div>
              ) : (
                <div className="space-y-6 max-w-3xl mx-auto">
                  {messages.map((msg, i) => (
                    <div key={msg.id ?? i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-[14px] ${msg.role === 'user' ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f]'}`}>
                        {msg.role === 'assistant'
                          ? <MarkdownBlock text={msg.content || '…'} />
                          : <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        }
                        <p className={`text-[12px] mt-1.5 ${msg.role === 'user' ? 'text-white/60' : 'text-[#86868b]'}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-[#d2d2d7] p-4 flex-shrink-0">
              <div className="max-w-3xl mx-auto flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="输入问题，Enter 发送，Shift+Enter 换行"
                  rows={2}
                  className="flex-1 px-4 py-3 bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] resize-none"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  className="p-3 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-sm flex-shrink-0"
                >
                  <Send className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </>
        ) : !loadingConvs ? (
          <div className="h-full flex items-center justify-center text-[#86868b] text-[14px]">
            请选择或创建一个会话
          </div>
        ) : null}
      </div>
    </div>

      {/* Delete Confirm Dialog */}
      {deletingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeletingId(null)} />
          <div className="relative bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.15)] w-full max-w-sm mx-4 p-6">
            <button
              onClick={() => setDeletingId(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors"
            >
              <X className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" strokeWidth={1.5} />
              </div>
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">删除会话</h3>
            </div>
            <p className="text-[14px] text-[#86868b] mb-6 leading-relaxed">
              确定要删除「<span className="text-[#1d1d1f] font-medium">{convs.find(c => c.id === deletingId)?.title || '新会话'}</span>」吗？删除后无法恢复。
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="px-5 py-2 bg-white rounded-xl border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-all text-[14px] font-medium"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteConv(deletingId)}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all text-[14px] font-medium shadow-sm"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
