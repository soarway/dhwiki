import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Editor } from '@bytemd/react';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import 'bytemd/dist/index.css';
import 'highlight.js/styles/vs.css';

interface NewDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kbId?: number;
  folderId?: number | null;
  onCreated?: () => void;
}

const plugins = [gfm(), highlight()];
const HEADER_H = 56; // px, matches h-14

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function NewDocumentDialog({ open, onOpenChange, kbId, folderId, onCreated }: NewDocumentDialogProps) {
  const [documentName, setDocumentName] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async () => {
    if (!documentName.trim()) {
      setErrorMsg('请输入文档名称');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const fileName = documentName.trim().endsWith('.md')
        ? documentName.trim()
        : `${documentName.trim()}.md`;
      const blob = new Blob([content], { type: 'text/markdown' });
      const formData = new FormData();
      formData.append('file', blob, fileName);
      if (kbId != null) formData.append('kb_id', String(kbId));
      if (folderId != null) formData.append('kb_folder_id', String(folderId));

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.detail || '保存失败，请重试');
        return;
      }

      setSuccessMsg(`「${fileName}」已保存`);
      setTimeout(() => {
        setDocumentName('');
        setContent('');
        setSuccessMsg('');
        onOpenChange(false);
        onCreated?.();
      }, 1200);
    } catch {
      setErrorMsg('网络错误，请检查连接后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setDocumentName('');
      setContent('');
      setErrorMsg('');
      setSuccessMsg('');
    }
    onOpenChange(o);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/20 z-40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 bg-white z-50 flex flex-col"
        >
          {/* ── 顶栏 h-14 = 56px ── */}
          <div className="flex-shrink-0 flex items-center h-14 px-6 gap-4 border-b border-[#d2d2d7]">
            <Dialog.Title className="text-[16px] font-bold text-[#1d1d1f] whitespace-nowrap">
              新建文档
            </Dialog.Title>

            <div className="flex-1 flex justify-center items-center gap-2">
              <span className="text-[14px] text-[#1d1d1f] whitespace-nowrap">文档名称：</span>
              <input
                type="text"
                value={documentName}
                onChange={e => { setDocumentName(e.target.value); setErrorMsg(''); }}
                placeholder="请输入文档名称"
                className="w-72 px-3 py-1.5 border border-[#d2d2d7] rounded focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] text-[14px] text-[#1d1d1f]"
              />
              {errorMsg && <span className="text-[13px] text-red-500 whitespace-nowrap">{errorMsg}</span>}
              {successMsg && <span className="text-[13px] text-[#34c759] whitespace-nowrap">{successMsg}</span>}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmit}
                disabled={saving || !!successMsg}
                className="px-5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-[14px] font-medium transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <Dialog.Close asChild>
                <button className="px-5 py-1.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg text-[14px] font-medium transition-colors">
                  取消
                </button>
              </Dialog.Close>
              <div className="w-px h-5 bg-[#d2d2d7] mx-1" />
              <Dialog.Close asChild>
                <button className="w-8 h-8 flex items-center justify-center border border-[#d2d2d7] rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* ── 编辑器区域 ──
               直接给 .bytemd 设 calc(100vh - 56px) 的明确像素高，
               不依赖 height:100% 继承，bytemd 内部 flex 自动分配工具栏/正文/页脚。
               CodeMirror height:100% → 填满编辑面板，内部 .CodeMirror-scroll 负责滚动。
               预览面板已由 bytemd 自身 CSS 设置 overflow-y:auto。
          ── */}
          <div className="nd-editor-wrap flex-1">
            <style>{`
              .nd-editor-wrap .bytemd { height: calc(100vh - 56px) !important; }
              .nd-editor-wrap .bytemd .CodeMirror { height: 100% !important; }
            `}</style>
            <Editor
              value={content}
              plugins={plugins}
              onChange={v => setContent(v)}
              placeholder="Start writing with ByteMD"
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
