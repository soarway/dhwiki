import { useState, useEffect, useRef, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, FileText, FileImage, File, Send, Bot, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

// ── Inline markdown renderer (bold / italic) ──────────────────────────────────
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="px-1 py-0.5 bg-[#f0f0f5] rounded text-[12px] font-mono">{part.slice(1, -1)}</code>;
    return part;
  });
}

// ── Block-level markdown renderer ────────────────────────────────────────────
function MarkdownBlock({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        // Ordered list
        if (/^\d+\.\s/.test(block)) {
          const items = block.split(/\n(?=\d+\.\s)/);
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {renderInline(item.replace(/^\d+\.\s+/, ''))}
                </li>
              ))}
            </ol>
          );
        }
        // Unordered list
        if (/^[-*]\s/.test(block)) {
          const items = block.split(/\n(?=[-*]\s)/);
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {renderInline(item.replace(/^[-*]\s+/, ''))}
                </li>
              ))}
            </ul>
          );
        }
        // Heading
        if (/^#{1,3}\s/.test(block)) {
          const content = block.replace(/^#+\s+/, '');
          return <p key={i} className="font-semibold leading-relaxed">{renderInline(content)}</p>;
        }
        // Normal paragraph (handle single \n as line-break)
        return (
          <p key={i} className="leading-relaxed">
            {block.split('\n').flatMap((line, j, arr) =>
              j < arr.length - 1
                ? [renderInline(line), <br key={`br-${j}`} />]
                : [renderInline(line)]
            )}
          </p>
        );
      })}
    </div>
  );
}

interface FileItem {
  id: number;
  name: string;
  file_type: string;
  file_size: number;
  process_status: string;
  created_at: string;
}

interface FilePreviewDialogProps {
  file: FileItem | null;
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:    { label: '等待处理', color: 'text-[#86868b] bg-[#f5f5f7]' },
  processing: { label: '处理中',   color: 'text-[#0071e3] bg-[#0071e3]/10' },
  completed:  { label: '已完成',   color: 'text-[#34c759] bg-[#34c759]/10' },
  failed:     { label: '处理失败', color: 'text-red-500 bg-red-50' },
};

const IMAGE_TYPES  = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
const TEXT_TYPES   = new Set(['txt', 'md', 'csv', 'log', 'json', 'xml', 'yaml', 'yml']);
const OFFICE_TYPES = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf']);

export function FilePreviewDialog({ file, onClose }: FilePreviewDialogProps) {
  // ── Preview state ──
  const [blobUrl, setBlobUrl]         = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [isLoading, setIsLoading]     = useState(false);

  // ── Chat state ──
  const [convId, setConvId]       = useState<number | null>(null);
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef            = useRef<HTMLDivElement>(null);
  const abortRef                  = useRef<AbortController | null>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

  const ext      = file?.file_type.toLowerCase() ?? '';
  const isImage  = IMAGE_TYPES.has(ext);
  const isPdf    = ext === 'pdf';
  const isText   = TEXT_TYPES.has(ext);
  const isOffice = OFFICE_TYPES.has(ext);
  const canPreview = isImage || isPdf || isText || isOffice;

  // ── Load file content ──
  useEffect(() => {
    setBlobUrl(null);
    setPreviewText(null);
    if (!file || !canPreview) return;

    let cancelled = false;
    setIsLoading(true);
    const token = localStorage.getItem('access_token');
    const url = isOffice
      ? `/api/files/${file.id}/preview`
      : `/api/files/${file.id}/download`;
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (cancelled) return;
        if (isText) {
          const text = await res.text();
          if (!cancelled) setPreviewText(text);
        } else {
          const blob = await res.blob();
          if (!cancelled) setBlobUrl(URL.createObjectURL(blob));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Revoke blob URL on change ──
  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  // ── Create conversation when file opens ──
  useEffect(() => {
    if (!file) return;
    setMessages([]);
    setConvId(null);
    setInput('');
    const token = localStorage.getItem('access_token');
    fetch('/api/chat/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title: `文件问答: ${file.name}` }),
    })
      .then(r => r.json())
      .then(data => setConvId(data.id))
      .catch(() => {});
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll chat ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──
  const sendMessage = useCallback(async () => {
    const query = input.trim();
    if (!query || !convId || isSending) return;

    setInput('');
    setIsSending(true);
    setMessages(prev => [
      ...prev,
      { role: 'user', content: query },
      { role: 'assistant', content: '', streaming: true },
    ]);

    const token = localStorage.getItem('access_token');
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/chat/conversations/${convId}/ask-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, doc_ids: [file!.id] }),
        signal: ctrl.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const tok = JSON.parse(data) as string;
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: last.content + tok };
              }
              return copy;
            });
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setMessages(prev => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = { ...last, content: '请求失败，请重试。', streaming: false };
          }
          return copy;
        });
      }
    } finally {
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 && m.streaming ? { ...m, streaming: false } : m,
      ));
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, convId, isSending, file]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDownload = () => {
    const token = localStorage.getItem('access_token');
    fetch(`/api/files/${file!.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file!.name;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  if (!file) return null;

  const status = STATUS_LABEL[file.process_status] ?? { label: file.process_status, color: 'text-[#86868b] bg-[#f5f5f7]' };

  return (
    <Dialog.Root open={!!file} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed inset-0 z-50 bg-white flex flex-col outline-none">

          {/* ── Top Header ── */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#d2d2d7] flex-shrink-0 bg-white">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0">
                {isImage
                  ? <FileImage className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                  : <FileText className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                }
              </div>
              <Dialog.Title className="text-[14px] font-semibold text-[#1d1d1f] truncate max-w-[60vw]">
                {file.name}
              </Dialog.Title>
              <span className="hidden sm:flex items-center gap-4 text-[12px] text-[#86868b] ml-2">
                <span>{file.file_type.toUpperCase()}</span>
                <span>{formatSize(file.file_size)}</span>
                <span>{formatDate(file.created_at)}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                  {status.label}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[13px] font-medium transition-colors"
              >
                <Download className="w-4 h-4" strokeWidth={1.5} />
                下载
              </button>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* ── Body: Preview (2/3) + Chat (1/3) ── */}
          <div className="flex flex-1 min-h-0">

            {/* ── Left: Preview ── */}
            <div className="flex-[2] min-w-0 flex flex-col border-r border-[#d2d2d7]">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-3">
                  <svg className="animate-spin w-8 h-8 text-[#0071e3]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-[14px] text-[#86868b]">
                    {isOffice ? '正在转换为 PDF，请稍候...' : '加载预览中...'}
                  </span>
                </div>
              ) : isImage && blobUrl ? (
                <div className="flex items-center justify-center flex-1 p-8 overflow-auto bg-[#f5f5f7]">
                  <img
                    src={blobUrl}
                    alt={file.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow"
                  />
                </div>
              ) : (isPdf || isOffice) && blobUrl ? (
                <iframe
                  src={`${blobUrl}#toolbar=1`}
                  className="flex-1 w-full border-0"
                  title={file.name}
                />
              ) : isText && previewText !== null ? (
                <div className="flex-1 overflow-auto">
                  <pre className="p-6 text-[13px] text-[#1d1d1f] font-mono leading-relaxed whitespace-pre-wrap break-words">
                    {previewText}
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
                  <div className="w-20 h-20 rounded-2xl bg-[#0071e3]/10 flex items-center justify-center mb-5">
                    <File className="w-10 h-10 text-[#0071e3]" strokeWidth={1} />
                  </div>
                  <p className="text-[17px] font-semibold text-[#1d1d1f] mb-2">{file.name}</p>
                  <p className="text-[14px] text-[#86868b] mb-6">
                    {file.file_type.toUpperCase()} 格式暂不支持在线预览，请下载后查看
                  </p>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl text-[14px] font-medium transition-colors shadow-sm"
                  >
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    下载文件
                  </button>
                </div>
              )}
            </div>

            {/* ── Right: Chat ── */}
            <div className="flex-[1] flex flex-col min-w-0 bg-[#fafafa]">
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#d2d2d7] bg-white flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#0071e3]/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                  </div>
                  <span className="text-[13px] font-semibold text-[#1d1d1f]">AI 问答</span>
                  <span className="text-[11px] text-[#86868b] bg-[#f5f5f7] px-2 py-0.5 rounded-full">仅限当前文件</span>
                </div>
                {messages.length > 0 && (
                  <button
                    onClick={() => {
                      abortRef.current?.abort();
                      setMessages([]);
                    }}
                    className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors text-[#86868b]"
                    title="清空对话"
                  >
                    <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                    <div className="w-12 h-12 rounded-2xl bg-[#0071e3]/10 flex items-center justify-center">
                      <Bot className="w-6 h-6 text-[#0071e3]" strokeWidth={1.5} />
                    </div>
                    <p className="text-[13px] text-[#86868b] leading-relaxed">
                      针对当前文件提问<br />AI 将基于文件内容回答
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-medium mt-0.5 ${
                      msg.role === 'user'
                        ? 'bg-[#0071e3] text-white'
                        : 'bg-[#f5f5f7] text-[#86868b]'
                    }`}>
                      {msg.role === 'user' ? '我' : <Bot className="w-4 h-4" strokeWidth={1.5} />}
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] ${
                      msg.role === 'user'
                        ? 'bg-[#0071e3] text-white rounded-tr-sm leading-relaxed'
                        : 'bg-white text-[#1d1d1f] rounded-tl-sm shadow-sm border border-[#e5e5ea]'
                    }`}>
                      {msg.role === 'user' ? (
                        msg.content
                      ) : msg.content ? (
                        <>
                          <MarkdownBlock text={msg.content} />
                          {msg.streaming && (
                            <span className="inline-block w-0.5 h-3.5 bg-[#86868b] ml-0.5 animate-pulse align-middle" />
                          )}
                        </>
                      ) : msg.streaming ? (
                        <span className="flex gap-1 items-center py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#86868b] animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#86868b] animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#86868b] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 border-t border-[#d2d2d7] bg-white p-3">
                <div className="flex items-end gap-2 bg-[#f5f5f7] rounded-xl px-3 py-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={convId ? '输入问题，Enter 发送，Shift+Enter 换行' : '正在初始化...'}
                    disabled={!convId || isSending}
                    rows={1}
                    className="flex-1 bg-transparent text-[13px] text-[#1d1d1f] placeholder-[#86868b] resize-none outline-none leading-relaxed max-h-32 overflow-y-auto disabled:opacity-50"
                    style={{ minHeight: '20px' }}
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = el.scrollHeight + 'px';
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || !convId || isSending}
                    className="w-7 h-7 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
