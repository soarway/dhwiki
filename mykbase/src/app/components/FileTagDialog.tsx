import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Tag, Plus, Trash2 } from 'lucide-react';

interface FileTag {
  id: number;
  file_id: number;
  name: string;
  created_by: number;
  created_at: string;
}

interface Props {
  fileId: number;
  fileName: string;
  open: boolean;
  onClose: () => void;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function FileTagDialog({ fileId, fileName, open, onClose }: Props) {
  const [tags, setTags] = useState<FileTag[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 加载标签
  useEffect(() => {
    if (!open) return;
    setInput('');
    setError('');
    fetch(`/api/social/files/${fileId}/tags`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setTags)
      .catch(() => setTags([]));
  }, [open, fileId]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const handleAdd = async () => {
    const name = input.trim();
    if (!name) { setError('标签不能为空'); return; }
    if ([...name].length > 9) { setError('标签最多 9 个字'); return; }
    setIsAdding(true);
    setError('');
    try {
      const res = await fetch(`/api/social/files/${fileId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || '添加失败');
        return;
      }
      const tag: FileTag = await res.json();
      setTags(prev => [...prev, tag]);
      setInput('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (tagId: number) => {
    const res = await fetch(`/api/social/file-tags/${tagId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok || res.status === 204) {
      setTags(prev => prev.filter(t => t.id !== tagId));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  const charCount = [...input].length;

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[90vw] max-w-md z-50 p-7 flex flex-col gap-5">

          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0">
              <Tag className="w-5 h-5 text-[#0071e3]" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-[16px] font-semibold text-[#1d1d1f]">给文件打标签</Dialog.Title>
              <Dialog.Description className="text-[12px] text-[#86868b] mt-0.5 truncate">{fileName}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors text-[#86868b]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          {/* Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); setError(''); }}
                  onKeyDown={handleKeyDown}
                  placeholder="输入标签名称，Enter 添加"
                  maxLength={18}
                  className="w-full px-3 py-2 pr-10 text-[13px] border border-[#d2d2d7] rounded-lg outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]/20 transition-all placeholder-[#86868b] text-[#1d1d1f]"
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] ${charCount > 9 ? 'text-red-500' : 'text-[#86868b]'}`}>
                  {charCount}/9
                </span>
              </div>
              <button
                onClick={handleAdd}
                disabled={isAdding || !input.trim() || charCount > 9}
                className="px-3 py-2 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                添加
              </button>
            </div>
            {error && <p className="text-[12px] text-red-500">{error}</p>}
          </div>

          {/* Tag list */}
          <div>
            <p className="text-[12px] font-medium text-[#86868b] mb-2.5">
              已有标签
              {tags.length > 0 && <span className="ml-1 text-[#0071e3]">{tags.length}</span>}
            </p>
            {tags.length === 0 ? (
              <div className="text-center py-6 text-[13px] text-[#86868b]">暂无标签</div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {tags.map(tag => (
                  <div
                    key={tag.id}
                    className="group flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-[#0071e3]/8 border border-[#0071e3]/20 text-[12px] text-[#0071e3] font-medium"
                  >
                    <span>{tag.name}</span>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#0071e3]/20 transition-colors opacity-60 hover:opacity-100"
                      title="删除标签"
                    >
                      <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
