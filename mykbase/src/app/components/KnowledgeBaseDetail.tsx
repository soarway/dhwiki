import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Upload, Download, MessageCircle, FileText, Folder, FolderUp, User, Settings, Send, X, Trash2, RefreshCw, Link, Bot, FolderSearch, Video, ChevronDown } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Viewer } from '@bytemd/react';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import 'bytemd/dist/index.css';
import 'highlight.js/styles/vs.css';
import { NewDocumentDialog } from './NewDocumentDialog';
import { NewFolderDialog } from './NewFolderDialog';
import { WatchDirDialog } from './WatchDirDialog';

const mdPlugins = [gfm(), highlight()];

// ─── Types ────────────────────────────────────────────────────────────────────

interface KbFolder {
  id: number;
  name: string;
  parent_id: number | null;
  created_by: number;
  is_empty: boolean;
  created_at: string;
}

interface KbFile {
  id: number;
  name: string;
  file_type: string;
  file_size: number;
  process_status: string;
  uploaded_by: number | null;
  uploader_name: string | null;
  created_at: string;
}

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
}

interface FolderStackItem {
  id: number;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `今天 ${timeStr}`;
  if (days === 1) return `昨天 ${timeStr}`;
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + timeStr;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:    { label: '等待处理', color: 'text-[#86868b] bg-[#f5f5f7]' },
  processing: { label: '处理中',   color: 'text-[#0071e3] bg-[#0071e3]/10' },
  completed:  { label: '已完成',   color: 'text-[#34c759] bg-[#34c759]/10' },
  failed:     { label: '处理失败', color: 'text-red-500 bg-red-50' },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface KnowledgeBaseDetailProps {
  kbId: number;
  knowledgeBaseName: string;
  onBack: () => void;
  onStatsChange?: () => void;
  onPermClick?: () => void;
  onEditClick?: () => void;
}

export function KnowledgeBaseDetail({ kbId, knowledgeBaseName, onBack, onStatsChange, onPermClick, onEditClick }: KnowledgeBaseDetailProps) {
  const [searchFileName, setSearchFileName] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [convId, setConvId] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newDocumentDialogOpen, setNewDocumentDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);

  // Folder navigation: null = KB root, number = current folder id
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [folderStack, setFolderStack] = useState<FolderStackItem[]>([]);

  // Data
  const [folders, setFolders] = useState<KbFolder[]>([]);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: number; is_super_admin: boolean } | null>(null);
  const [protectDays, setProtectDays] = useState(3);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; isFolder?: boolean } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [folderUploadPending, setFolderUploadPending] = useState<{
    folderName: string;
    files: { file: File; relativePath: string }[];
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [importUrlValue, setImportUrlValue] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [watchDirOpen, setWatchDirOpen] = useState(false);
  const [shortVideoToast, setShortVideoToast] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Reset chat when panel closes
  useEffect(() => {
    if (!aiPanelOpen) {
      setMessages([]);
      setConvId(null);
      setIsSending(false);
    }
  }, [aiPanelOpen]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me', { headers: authHeaders() }).then(r => r.ok ? r.json() : null),
      fetch('/api/settings', { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
    ]).then(([user, settings]) => {
      if (user) setCurrentUser({ id: user.id, is_super_admin: user.is_super_admin });
      const days = (settings as { key: string; value: string }[]).find(s => s.key === 'file_delete_protect_days')?.value;
      if (days != null) setProtectDays(Number(days));
    });
  }, []);

  const uploadFiles = async (fileList: File[]) => {
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    for (const file of fileList) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kb_id', String(kbId));
      if (currentFolderId != null) formData.append('kb_folder_id', String(currentFolderId));
      await fetch('/api/files/upload', { method: 'POST', headers, body: formData });
    }
    loadContent();
    onStatsChange?.();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    e.target.value = '';
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    // webkitRelativePath 格式: "folderName/sub/file.ext"
    const folderName = files[0].webkitRelativePath?.split('/')[0] ?? '所选文件夹';
    const collected = files.map(f => ({
      file: f,
      relativePath: f.webkitRelativePath || f.name,
    }));
    setFolderUploadPending({ folderName, files: collected });
    e.target.value = '';
  };

  const confirmFolderUpload = async () => {
    if (!folderUploadPending) return;
    setIsUploading(true);
    try {
      const token = localStorage.getItem('access_token');
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const jsonHeaders = { 'Content-Type': 'application/json', ...headers };

      // 缓存 "相对路径字符串 → KB folder id"，避免重复建同一文件夹
      const folderCache = new Map<string, number>();

      // 递归确保指定路径的 KB 文件夹存在，返回其 id
      const ensureFolder = async (segments: string[]): Promise<number> => {
        const pathKey = segments.join('/');
        if (folderCache.has(pathKey)) return folderCache.get(pathKey)!;

        // 先确保父目录存在
        const parentId: number | null = segments.length === 1
          ? (currentFolderId ?? null)
          : await ensureFolder(segments.slice(0, -1));

        const res = await fetch('/api/kb-folders', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            kb_id: kbId,
            name: segments[segments.length - 1],
            parent_id: parentId,
          }),
        });
        if (!res.ok) throw new Error('创建文件夹失败');
        const folder = await res.json();
        folderCache.set(pathKey, folder.id);
        return folder.id;
      };

      // 按文件的 relativePath 逐一创建目录结构并上传
      for (const { file, relativePath } of folderUploadPending.files) {
        // relativePath 形如 "logo/sub1/sub2/file.txt"
        const parts = relativePath.split('/');
        const dirSegments = parts.slice(0, -1); // 去掉文件名，只保留目录层级

        let targetFolderId: number | null = null;
        if (dirSegments.length > 0) {
          targetFolderId = await ensureFolder(dirSegments);
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('kb_id', String(kbId));
        if (targetFolderId != null) formData.append('kb_folder_id', String(targetFolderId));
        await fetch('/api/files/upload', { method: 'POST', headers, body: formData });
      }

      loadContent();
      onStatsChange?.();
    } catch (err) {
      console.error('文件夹上传失败', err);
    } finally {
      setIsUploading(false);
      setFolderUploadPending(null);
    }
  };

  const handleImportUrl = async () => {
    const url = importUrlValue.trim();
    if (!url) return;
    setIsImporting(true);
    setImportError('');
    try {
      const res = await fetch('/api/files/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ url, kb_id: kbId, kb_folder_id: currentFolderId ?? null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setImportError(err.detail || '导入失败，请检查 URL 是否可访问');
        return;
      }
      setImportUrlOpen(false);
      setImportUrlValue('');
      loadContent();
      onStatsChange?.();
    } catch {
      setImportError('网络错误，请重试');
    } finally {
      setIsImporting(false);
    }
  };

  const loadContent = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const skip = (currentPage - 1) * pageSize;
      const folderParam = currentFolderId != null ? `&parent_id=${currentFolderId}` : '';
      const fileFolderParam = currentFolderId != null ? `&folder_id=${currentFolderId}` : '';
      const nameParam = activeSearch ? `&name=${encodeURIComponent(activeSearch)}` : '';

      // 搜索时不显示文件夹（按名称只搜文件）
      const [foldersRes, filesRes] = await Promise.all([
        activeSearch
          ? Promise.resolve(null)
          : fetch(`/api/kb-folders?kb_id=${kbId}${folderParam}`, { headers: authHeaders() }),
        fetch(`/api/files?kb_id=${kbId}${fileFolderParam}&skip=${skip}&limit=${pageSize}${nameParam}`, { headers: authHeaders() }),
      ]);

      if (foldersRes && foldersRes.ok) setFolders(await foldersRes.json());
      else if (!foldersRes) setFolders([]);
      if (filesRes.ok) {
        const data = await filesRes.json();
        setFiles(data.items);
        setTotalFiles(data.total);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [kbId, currentFolderId, currentPage, pageSize, activeSearch]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // Auto-poll while any file is pending/processing
  useEffect(() => {
    const hasInProgress = files.some(f => f.process_status === 'pending' || f.process_status === 'processing');
    if (!hasInProgress) return;
    const timer = setTimeout(() => { loadContent(true); }, 3000);
    return () => clearTimeout(timer);
  }, [files, loadContent]);

  // ".." click: go up one level or back to home
  const handleGoUp = () => {
    if (folderStack.length === 0) {
      onBack();
    } else {
      const newStack = folderStack.slice(0, -1);
      const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : null;
      setFolderStack(newStack);
      setCurrentFolderId(parentId);
      setCurrentPage(1);
      setSearchFileName('');
      setActiveSearch('');
    }
  };

  const handleFolderClick = (folder: KbFolder) => {
    setFolderStack(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    setCurrentPage(1);
    setSearchFileName('');
    setActiveSearch('');
  };

  const canDeleteFolder = (folder: KbFolder): boolean => {
    if (!currentUser) return false;
    if (!folder.is_empty) return false;
    return currentUser.is_super_admin || folder.created_by === currentUser.id;
  };

  const handleFolderDelete = async (e: React.MouseEvent, folder: KbFolder) => {
    e.stopPropagation();
    setDeleteTarget({ id: folder.id, name: folder.name, isFolder: true });
  };

  const handleDelete = (e: React.MouseEvent, file: KbFile) => {
    e.stopPropagation();
    setDeleteTarget({ id: file.id, name: file.name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const url = deleteTarget.isFolder
        ? `/api/kb-folders/${deleteTarget.id}`
        : `/api/files/${deleteTarget.id}`;
      await fetch(url, { method: 'DELETE', headers: authHeaders() });
      const wasFolder = deleteTarget.isFolder;
      setDeleteTarget(null);
      loadContent();
      if (!wasFolder) onStatsChange?.();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetry = async (e: React.MouseEvent, fileId: number) => {
    e.stopPropagation();
    await fetch(`/api/files/${fileId}/retry`, { method: 'POST', headers: authHeaders() });
    loadContent();
  };

  const canDelete = (file: KbFile): boolean => {
    if (!currentUser) return false;
    if (currentUser.is_super_admin) return true;
    if (file.uploaded_by !== currentUser.id) return false;
    const ageDays = (Date.now() - new Date(file.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays <= protectDays;
  };

  const totalPages = Math.ceil(totalFiles / pageSize);
  const totalCount = folders.length + totalFiles;

  const handleFileClick = (file: KbFile) => {
    const SIZE_300MB = 300 * 1024 * 1024;
    if (file.file_size > SIZE_300MB) {
      const token = localStorage.getItem('access_token');
      fetch(`/api/files/${file.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        });
    } else {
      window.open(`/#preview/${file.id}`, '_blank');
    }
  };

  const handleSendMessage = async () => {
    const content = inputMessage.trim();
    if (!content || isSending) return;

    const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { id: Date.now().toString(), type: 'user', content, timestamp: now }]);
    setInputMessage('');
    setIsSending(true);

    try {
      // Create conversation on first message
      let cid = convId;
      if (!cid) {
        const res = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ title: null }),
        });
        if (!res.ok) return;
        const data = await res.json();
        cid = data.id;
        setConvId(cid);
      }

      // Placeholder AI message
      const aiId = (Date.now() + 1).toString();
      const aiTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      setMessages(prev => [...prev, { id: aiId, type: 'ai', content: '', timestamp: aiTime }]);

      // SSE streaming
      const res = await fetch(`/api/chat/conversations/${cid}/ask-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          query: content,
          kb_id: kbId,
          ...(currentFolderId != null ? { kb_folder_id: currentFolderId } : {}),
        }),
      });
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
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
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const token = JSON.parse(raw);
            const text = typeof token === 'string' ? token : token?.text;
            if (text) {
              setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: m.content + text } : m));
            }
          } catch { /* ignore */ }
        }
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="size-full flex overflow-hidden">
      {/* Left Side - File List */}
      <div className={`flex flex-col overflow-hidden transition-all duration-300 ${aiPanelOpen ? 'w-[45%]' : 'w-full'}`}>
        {/* Top Bar */}
        <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center justify-between px-8">
          <div className="flex items-center gap-2">
            <span className="text-[21px]">🗂️</span>
            <h1 className="text-[21px] font-semibold text-[#1d1d1f]">{knowledgeBaseName}</h1>
            {folderStack.length > 0 && (
              <div className="flex items-center gap-1 text-[14px] text-[#86868b]">
                {folderStack.map((f, i) => (
                  <span key={f.id}>
                    <span className="mx-1">/</span>
                    <span>{f.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onPermClick}
              title="权限设置"
              className="p-2 rounded-lg hover:bg-[#0071e3]/10 transition-colors"
            >
              <User className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
            </button>
            <button
              onClick={onEditClick}
              title="基础信息设置"
              className="p-2 rounded-lg hover:bg-[#0071e3]/10 transition-colors"
            >
              <Settings className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Search and Actions Bar */}
        <div className="bg-[#fbfbfd] border-b border-[#d2d2d7]/50 px-8 py-4">
          <div className="flex items-center gap-4">
            {!aiPanelOpen && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-[14px] text-[#86868b] whitespace-nowrap">文件名:</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchFileName}
                      onChange={(e) => setSearchFileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setActiveSearch(searchFileName.trim());
                          setCurrentPage(1);
                        }
                      }}
                      placeholder="输入文件名关键字"
                      className="w-96 px-3 py-1.5 pr-8 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                    />
                    {searchFileName && (
                      <button
                        onClick={() => {
                          setSearchFileName('');
                          setActiveSearch('');
                          setCurrentPage(1);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[#e5e5e7] transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-[#86868b]" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setActiveSearch(searchFileName.trim()); setCurrentPage(1); }}
                  className="px-4 py-1.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] hover:border-[#86868b] transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-[#1d1d1f]"
                >
                  <Search className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  搜索文件
                </button>
              </>
            )}
            <div className="flex-1" />

            {!aiPanelOpen && (
              <>
                {/* New */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="px-4 py-1.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-[#1d1d1f]">
                      <Plus className="w-[16px] h-[16px]" strokeWidth={2} />
                      新建
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="min-w-[140px] bg-white rounded-xl border border-[#d2d2d7] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-2 z-50" sideOffset={5}>
                      <DropdownMenu.Item onClick={() => setNewDocumentDialogOpen(true)} className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-[#0071e3]/10 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-[#0071e3]" strokeWidth={1.5} />
                        </div>
                        <span className="text-[14px] text-[#1d1d1f]">文档</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onClick={() => setNewFolderDialogOpen(true)} className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-[#FFB020]/10 flex items-center justify-center">
                          <Folder className="w-5 h-5 text-[#FFB020]" strokeWidth={1.5} />
                        </div>
                        <span className="text-[14px] text-[#1d1d1f]">文件夹</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                {/* Upload */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="px-4 py-1.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-[#1d1d1f]">
                      <Upload className="w-[16px] h-[16px]" strokeWidth={1.5} />
                      上传
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="min-w-[140px] bg-white rounded-xl border border-[#d2d2d7] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-2 z-50" sideOffset={5}>
                      <DropdownMenu.Item onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-[#0071e3]/10 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-[#0071e3]" strokeWidth={1.5} />
                        </div>
                        <span className="text-[14px] text-[#1d1d1f]">文件</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onClick={() => folderInputRef.current?.click()} className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-[#FFB020]/10 flex items-center justify-center">
                          <Folder className="w-5 h-5 text-[#FFB020]" strokeWidth={1.5} />
                        </div>
                        <span className="text-[14px] text-[#1d1d1f]">文件夹</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="px-4 py-1.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-[#1d1d1f]">
                      <Download className="w-[16px] h-[16px]" strokeWidth={1.5} />
                      导入
                      <ChevronDown className="w-3.5 h-3.5 text-[#86868b]" strokeWidth={2} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      className="bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-[#d2d2d7] p-1.5 z-40 min-w-[160px]"
                    >
                      <DropdownMenu.Item
                        onClick={() => { setImportUrlOpen(true); setImportError(''); setImportUrlValue(''); }}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors text-[13px] text-[#1d1d1f]"
                      >
                        <Link className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                        从URL导入
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onClick={() => setWatchDirOpen(true)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors text-[13px] text-[#1d1d1f]"
                      >
                        <FolderSearch className="w-4 h-4 text-[#FFB020]" strokeWidth={1.5} />
                        从目录导入
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onClick={() => { setShortVideoToast(true); setTimeout(() => setShortVideoToast(false), 3000); }}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors text-[13px] text-[#1d1d1f]"
                      >
                        <Video className="w-4 h-4 text-[#FF3B30]" strokeWidth={1.5} />
                        从短视频导入
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
                <button
                  onClick={() => setAiPanelOpen(true)}
                  className="px-4 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg transition-all duration-150 flex items-center gap-2 text-[14px] font-medium"
                >
                  <MessageCircle className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  问AI
                </button>
              </>
            )}
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-[14px] text-[#86868b]">加载中...</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f5f5f7] border-b border-[#d2d2d7]">
                    <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">名称</th>
                    {!aiPanelOpen && (
                      <>
                        <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">创建人</th>
                        <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">大小</th>
                        <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">更新时间</th>
                        <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">状态</th>
                        <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">操作</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {/* ".." row — always visible */}
                  <tr
                    onClick={handleGoUp}
                    className="border-b border-[#d2d2d7]/50 hover:bg-[#f5f5f7] transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <FolderUp className="w-5 h-5 text-[#0071e3] group-hover:text-[#0077ed]" strokeWidth={1.5} />
                        <span className="text-[17px] font-medium text-[#86868b] group-hover:text-[#1d1d1f]">..</span>
                      </div>
                    </td>
                    {!aiPanelOpen && (
                      <>
                        <td className="px-6 py-3 text-[14px] text-[#86868b]"></td>
                        <td className="px-6 py-3 text-[14px] text-[#86868b]"></td>
                        <td className="px-6 py-3 text-[14px] text-[#86868b]"></td>
                        <td className="px-6 py-3 text-[14px] text-[#86868b]"></td>
                        <td className="px-6 py-3 text-[14px] text-[#86868b]"></td>
                      </>
                    )}
                  </tr>

                  {/* Folders */}
                  {folders.map((folder) => (
                    <tr
                      key={`folder-${folder.id}`}
                      onClick={() => handleFolderClick(folder)}
                      className="border-b border-[#d2d2d7]/50 hover:bg-[#f5f5f7]/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <Folder className="w-5 h-5 text-[#FFB020]" strokeWidth={1.5} />
                          <span className="text-[14px] text-[#1d1d1f]">{folder.name}</span>
                        </div>
                      </td>
                      {!aiPanelOpen && (
                        <>
                          <td className="px-6 py-3 text-[14px] text-[#86868b]">—</td>
                          <td className="px-6 py-3 text-[14px] text-[#86868b]">—</td>
                          <td className="px-6 py-3 text-[14px] text-[#1d1d1f]">{formatDate(folder.created_at)}</td>
                          <td className="px-6 py-3 text-[14px] text-[#86868b]"></td>
                          <td className="px-6 py-3">
                            {canDeleteFolder(folder) && (
                              <div onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={(e) => handleFolderDelete(e, folder)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                  title="删除文件夹"
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                                </button>
                              </div>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}

                  {/* Files */}
                  {files.map((file) => (
                    <tr
                      key={`file-${file.id}`}
                      onClick={() => handleFileClick(file)}
                      className="border-b border-[#d2d2d7]/50 hover:bg-[#f5f5f7]/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-[#0071e3]" strokeWidth={1.5} />
                          <span className="text-[14px] text-[#1d1d1f]">{file.name}</span>
                        </div>
                      </td>
                      {!aiPanelOpen && (
                        <>
                          <td className="px-6 py-3 text-[14px] text-[#86868b]">{file.uploader_name || '—'}</td>
                          <td className="px-6 py-3 text-[14px] text-[#86868b]">{formatSize(file.file_size)}</td>
                          <td className="px-6 py-3 text-[14px] text-[#1d1d1f]">{formatDate(file.created_at)}</td>
                          <td className="px-6 py-3">
                            {(() => {
                              const s = STATUS_CONFIG[file.process_status] ?? { label: file.process_status, color: 'text-[#86868b] bg-[#f5f5f7]' };
                              return <span className={`px-2 py-0.5 rounded-full text-[12px] font-medium ${s.color}`}>{s.label}</span>;
                            })()}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={(e) => handleRetry(e, file.id)}
                                className={`p-1.5 rounded-lg hover:bg-[#0071e3]/10 transition-colors ${file.process_status === 'failed' ? '' : 'invisible'}`}
                                title="重新处理"
                              >
                                <RefreshCw className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                              </button>
                              {canDelete(file) && (
                                <button
                                  onClick={(e) => handleDelete(e, file)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                  title="删除文件"
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}

                  {/* Empty state */}
                  {!isLoading && folders.length === 0 && files.length === 0 && (
                    <tr>
                      <td colSpan={aiPanelOpen ? 1 : 6} className="px-6 py-16 text-center text-[14px] text-[#86868b]">
                        暂无文件，请上传或新建文件
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 0 && (
            <div className="mt-6 flex items-center justify-end gap-4">
              <div className="text-[14px] text-[#86868b]">
                共 <span className="text-[#1d1d1f] font-medium">{totalCount}</span> 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded-lg bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-40 text-[14px]"
                >
                  &lt;&lt;
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded-lg bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-40 text-[14px]"
                >
                  &lt;
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const page = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-[14px] ${page === currentPage ? 'bg-[#0071e3] text-white' : 'bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]'}`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-lg bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-40 text-[14px]"
                >
                  &gt;
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-lg bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-40 text-[14px]"
                >
                  &gt;&gt;
                </button>
              </div>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-[#86868b]">跳至</span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  defaultValue={currentPage}
                  onBlur={(e) => {
                    const p = Math.max(1, Math.min(totalPages, Number(e.target.value)));
                    setCurrentPage(p);
                  }}
                  className="w-16 px-2 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] text-center"
                />
                <span className="text-[14px] text-[#86868b]">页</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - AI Chat Panel */}
      {aiPanelOpen && (
        <div className="w-[55%] border-l border-[#d2d2d7] bg-white flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 bg-[#fbfbfd] border-b border-[#d2d2d7] px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#0071e3]" strokeWidth={1.5} />
                <h2 className="text-[17px] font-semibold text-[#1d1d1f]">AI 问答</h2>
              </div>
              <button onClick={() => setAiPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
              </button>
            </div>
            {/* Scope hint */}
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#86868b]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] flex-shrink-0" />
              {currentFolderId === null
                ? <span>检索范围：<span className="text-[#1d1d1f] font-medium">「{knowledgeBaseName}」</span> 全部文件</span>
                : <span>检索范围：<span className="text-[#1d1d1f] font-medium">「{folderStack[folderStack.length - 1]?.name}」</span> 及子文件夹</span>
              }
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-[#0071e3]/10 flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-[#0071e3]" strokeWidth={1.5} />
                </div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f] mb-2">开始与AI对话</h3>
                <p className="text-[14px] text-[#86868b] max-w-xs">针对当前检索范围内的文件提问，AI将基于知识库内容回答。</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`flex gap-2 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.type === 'ai' && (
                    <div className="w-7 h-7 rounded-full bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.type === 'user' ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f]'}`}>
                    {message.type === 'ai' && message.content === '' ? (
                      <span className="inline-block w-2 h-4 bg-[#0071e3] rounded-sm animate-pulse" />
                    ) : message.type === 'ai' ? (
                      <div className="kb-ai-md text-[14px] leading-relaxed">
                        <style>{`
                          .kb-ai-md .bytemd { border: none !important; background: transparent !important; }
                          .kb-ai-md .bytemd-toolbar { display: none !important; }
                          .kb-ai-md .bytemd-body { padding: 0 !important; }
                          .kb-ai-md .bytemd-preview { padding: 0 !important; }
                          .kb-ai-md .markdown-body { background: transparent !important; font-size: 14px !important; color: #1d1d1f !important; }
                          .kb-ai-md .markdown-body p { margin: 0.25em 0; }
                          .kb-ai-md .markdown-body h1, .kb-ai-md .markdown-body h2, .kb-ai-md .markdown-body h3 { margin: 0.5em 0 0.25em; }
                          .kb-ai-md .markdown-body ul, .kb-ai-md .markdown-body ol { padding-left: 1.2em; margin: 0.25em 0; }
                          .kb-ai-md .markdown-body pre { background: #f0f0f0 !important; border-radius: 6px; padding: 8px 12px; margin: 0.4em 0; }
                          .kb-ai-md .markdown-body code:not(pre code) { background: #e8e8e8 !important; padding: 1px 4px; border-radius: 3px; }
                          .kb-ai-md .markdown-body blockquote { border-left: 3px solid #0071e3; padding-left: 0.8em; color: #555; margin: 0.4em 0; }
                        `}</style>
                        <Viewer value={message.content} plugins={mdPlugins} />
                      </div>
                    ) : (
                      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    )}
                    <p className={`text-[12px] mt-1 ${message.type === 'user' ? 'text-white/70' : 'text-[#86868b]'}`}>{message.timestamp}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[#d2d2d7] p-4">
            <div className="flex items-end gap-2 bg-[#f5f5f7] rounded-xl px-3 py-2">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }}
                placeholder="输入问题，Enter 发送…"
                disabled={isSending}
                className="flex-1 bg-transparent text-[13px] text-[#1d1d1f] placeholder-[#86868b] resize-none outline-none leading-relaxed max-h-32 overflow-y-auto disabled:opacity-60"
                style={{ minHeight: '20px' }}
                rows={1}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isSending}
                className="w-7 h-7 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5 text-white" strokeWidth={2} />
              </button>
            </div>
            <p className="text-[11px] text-[#86868b] mt-1.5 px-1">Enter 发送，Shift+Enter 换行</p>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mov,.avi"
        onChange={handleFileUpload}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-ignore
        webkitdirectory=""
        onChange={handleFolderSelect}
        className="hidden"
      />


      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={!!deleteTarget} onOpenChange={(open) => { if (!open && !isDeleting) setDeleteTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[90vw] max-w-md z-50 p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-5">
              <Trash2 className="w-7 h-7 text-red-500" strokeWidth={1.5} />
            </div>
            <Dialog.Title className="text-[19px] font-semibold text-[#1d1d1f] mb-2">
              {deleteTarget?.isFolder ? '删除文件夹' : '删除文件'}
            </Dialog.Title>
            <Dialog.Description className="text-[14px] text-[#86868b] leading-relaxed mb-1">
              {deleteTarget?.isFolder ? '确定要删除以下文件夹吗？' : '确定要删除以下文件吗？'}
            </Dialog.Description>
            <p className="text-[14px] font-medium text-[#1d1d1f] mb-6 px-4 break-all">
              {deleteTarget?.name}
            </p>
            <p className="text-[13px] text-red-400 mb-8">此操作不可撤销，文件将被永久删除。</p>
            <div className="flex gap-3 w-full">
              <Dialog.Close asChild>
                <button
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-white rounded-xl border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[14px] font-medium"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-70 disabled:cursor-not-allowed text-white rounded-xl transition-all text-[14px] font-medium shadow-sm flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    删除中...
                  </>
                ) : '确认删除'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {/* Import URL Dialog */}
      <Dialog.Root open={importUrlOpen} onOpenChange={(open) => { if (!isImporting) { setImportUrlOpen(open); if (!open) setImportError(''); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[90vw] max-w-lg z-50 p-8">
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0">
                <Link className="w-6 h-6 text-[#0071e3]" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f] mb-1">
                  从 URL 导入
                </Dialog.Title>
                <Dialog.Description className="text-[13px] text-[#86868b]">
                  输入网页地址，系统将抓取页面内容并保存为文件加入知识库
                </Dialog.Description>
              </div>
            </div>

            {/* URL Input */}
            <div className="mb-5">
              <label className="block text-[13px] font-medium text-[#1d1d1f] mb-2">网页 URL</label>
              <input
                type="url"
                value={importUrlValue}
                onChange={(e) => { setImportUrlValue(e.target.value); setImportError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isImporting) handleImportUrl(); }}
                placeholder="https://example.com/article"
                disabled={isImporting}
                className="w-full px-4 py-2.5 bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] font-mono disabled:opacity-60"
                autoFocus
              />
              {importError && (
                <p className="mt-2 text-[13px] text-red-500">{importError}</p>
              )}
              <p className="mt-2 text-[12px] text-[#86868b]">支持 http / https 网页；导入后内容将自动处理并加入知识库索引</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button
                  disabled={isImporting}
                  className="flex-1 py-2.5 bg-white rounded-xl border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[14px] font-medium"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                onClick={handleImportUrl}
                disabled={isImporting || !importUrlValue.trim()}
                className="flex-1 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl transition-all text-[14px] font-medium shadow-sm flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    抓取中...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    确认导入
                  </>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Watch Directory Dialog */}
      <WatchDirDialog
        kbId={kbId}
        kbName={knowledgeBaseName}
        open={watchDirOpen}
        onClose={() => setWatchDirOpen(false)}
      />

      {/* Short Video Toast */}
      {shortVideoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-[#1d1d1f] text-white text-[13px] px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2">
          <Video className="w-4 h-4 text-[#FF3B30]" strokeWidth={1.5} />
          功能开发中，敬请期待
        </div>
      )}

      {/* Folder Upload Confirmation Dialog */}
      {(() => {
        const pending = folderUploadPending;
        const totalSize = pending?.files.reduce((sum, { file }) => sum + file.size, 0) ?? 0;
        return (
          <Dialog.Root open={!!pending} onOpenChange={(open) => { if (!open && !isUploading) setFolderUploadPending(null); }}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[90vw] max-w-lg z-50 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-7 pt-7 pb-5 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#FFB020]/10 flex items-center justify-center flex-shrink-0">
                    <Folder className="w-6 h-6 text-[#FFB020]" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f] mb-0.5">
                      上传文件夹
                    </Dialog.Title>
                    <Dialog.Description className="text-[13px] text-[#86868b]">
                      将在知识库中创建文件夹 <span className="font-medium text-[#1d1d1f]">「{pending?.folderName}」</span>，并上传&nbsp;
                      <span className="font-medium text-[#0071e3]">{pending?.files.length ?? 0}</span> 个文件，
                      合计 <span className="font-medium text-[#1d1d1f]">{formatSize(totalSize)}</span>
                    </Dialog.Description>
                  </div>
                </div>

                {/* File List */}
                <div className="mx-7 mb-5 rounded-xl border border-[#d2d2d7] overflow-hidden">
                  <div className="bg-[#f5f5f7] px-4 py-2 text-[12px] font-medium text-[#86868b] border-b border-[#d2d2d7]">
                    文件列表
                  </div>
                  <div className="overflow-y-auto max-h-52">
                    {pending?.files.map(({ file, relativePath }, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#d2d2d7]/60 last:border-0 hover:bg-[#f5f5f7]/50">
                        <FileText className="w-4 h-4 text-[#0071e3] flex-shrink-0" strokeWidth={1.5} />
                        <span className="flex-1 text-[13px] text-[#1d1d1f] truncate font-mono" title={relativePath}>
                          {relativePath}
                        </span>
                        <span className="text-[12px] text-[#86868b] flex-shrink-0">{formatSize(file.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="px-7 pb-7 flex gap-3">
                  <Dialog.Close asChild>
                    <button
                      disabled={isUploading}
                      className="flex-1 py-2.5 bg-white rounded-xl border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[14px] font-medium"
                    >
                      取消
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={confirmFolderUpload}
                    disabled={isUploading}
                    className="flex-1 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl transition-all text-[14px] font-medium shadow-sm flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        上传中...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" strokeWidth={1.5} />
                        确认上传
                      </>
                    )}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        );
      })()}

      <NewDocumentDialog
        open={newDocumentDialogOpen}
        onOpenChange={setNewDocumentDialogOpen}
        kbId={kbId}
        folderId={currentFolderId}
        onCreated={loadContent}
      />
      <NewFolderDialog
        open={newFolderDialogOpen}
        onOpenChange={setNewFolderDialogOpen}
        kbId={kbId}
        parentFolderId={currentFolderId}
        onCreated={loadContent}
      />
    </div>
  );
}
