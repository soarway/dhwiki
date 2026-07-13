import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Folder } from 'lucide-react';

interface NewFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kbId: number;
  parentFolderId: number | null;
  onCreated?: () => void;
}

export function NewFolderDialog({ open, onOpenChange, kbId, parentFolderId, onCreated }: NewFolderDialogProps) {
  const [folderName, setFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!folderName.trim()) {
      setErrorMsg('请输入文件夹名称');
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/kb-folders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kb_id: kbId,
          name: folderName.trim(),
          parent_id: parentFolderId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || '创建失败，请重试');
        return;
      }

      setFolderName('');
      onOpenChange(false);
      onCreated?.();
    } catch {
      setErrorMsg('网络错误，请检查连接后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFolderName('');
      setErrorMsg('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-6 w-full max-w-md z-50">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">
              新建文件夹
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-5">
            {errorMsg && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[14px] text-red-600">
                {errorMsg}
              </div>
            )}

            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#FFB020]/10 flex items-center justify-center flex-shrink-0">
                <Folder className="w-8 h-8 text-[#FFB020]" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  文件夹名称
                </label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                  placeholder="请输入文件夹名称"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">
                  取消
                </button>
              </Dialog.Close>
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-all text-[14px] font-medium"
              >
                {isLoading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
