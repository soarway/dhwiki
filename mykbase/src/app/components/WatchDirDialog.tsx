import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, FolderSearch, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface WatchDir {
  id: number;
  name: string;
  fs_path: string;
  description: string;
  is_active: boolean;
  kb_id: number | null;
  last_scan_at: string | null;
  scan_total: number;
  scan_done: number;
  scan_failed: number;
}

interface Props {
  kbId: number;
  kbName: string;
  open: boolean;
  onClose: () => void;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function ScanProgress({ dir }: { dir: WatchDir }) {
  const { scan_total, scan_done, scan_failed, last_scan_at } = dir;

  if (scan_total === 0 && !last_scan_at) {
    return <p className="text-[11px] text-[#86868b]">尚未扫描</p>;
  }

  if (scan_total === 0 && last_scan_at) {
    return (
      <p className="text-[11px] text-[#86868b]">
        上次扫描：{new Date(last_scan_at).toLocaleString('zh-CN')} · 未找到支持的文件
      </p>
    );
  }

  const pct = scan_total > 0 ? Math.round((scan_done / scan_total) * 100) : 0;
  const inProgress = scan_done < scan_total;

  return (
    <div className="space-y-1 mt-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-[#d2d2d7] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${inProgress ? 'bg-[#0071e3]' : scan_failed > 0 ? 'bg-[#ff9500]' : 'bg-[#34c759]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-medium text-[#1d1d1f] w-8 text-right">{pct}%</span>
      </div>
      <p className="text-[11px] text-[#86868b]">
        {inProgress ? (
          <>扫描中：{scan_done} / {scan_total} 个文件{scan_failed > 0 && <span className="text-red-400"> · 失败 {scan_failed}</span>}</>
        ) : (
          <>
            {scan_failed > 0
              ? <><span className="text-[#ff9500]">完成（含失败）</span>：共 {scan_total} 个文件，失败 {scan_failed}</>
              : <><span className="text-[#34c759]">扫描完成</span>：共 {scan_total} 个文件</>
            }
            {last_scan_at && <> · {new Date(last_scan_at).toLocaleString('zh-CN')}</>}
          </>
        )}
      </p>
    </div>
  );
}

export function WatchDirDialog({ kbId, kbName, open, onClose }: Props) {
  const [dirs, setDirs] = useState<WatchDir[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [addPath, setAddPath] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [scanningId, setScanningId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDirs = async () => {
    try {
      const res = await fetch(`/api/watch-dirs/?kb_id=${kbId}`, { headers: authHeaders() });
      if (res.ok) {
        setDirs(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || '加载失败');
      }
    } catch {
      setError('网络错误');
    }
  };

  // Auto-poll while any dir is scanning (scan_done < scan_total)
  useEffect(() => {
    const anyInProgress = dirs.some(d => d.scan_total > 0 && d.scan_done < d.scan_total);
    if (anyInProgress && !pollRef.current) {
      pollRef.current = setInterval(fetchDirs, 3000);
    } else if (!anyInProgress && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [dirs]);

  useEffect(() => {
    if (!open) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    setAddPath('');
    setAddError('');
    setError('');
    setIsLoading(true);
    fetchDirs().finally(() => setIsLoading(false));
  }, [open, kbId]);

  const handleAdd = async () => {
    const path = addPath.trim();
    const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
    if (!path) { setAddError('请输入目录路径'); return; }
    setIsAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/watch-dirs/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name, fs_path: path, kb_id: kbId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAddError(data.detail || '添加失败');
        return;
      }
      const wd: WatchDir = await res.json();
      setDirs(prev => [...prev, wd]);
      setAddPath('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/watch-dirs/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok || res.status === 204) {
      setDirs(prev => prev.filter(d => d.id !== id));
    }
  };

  const handleScan = async (id: number) => {
    setScanningId(id);
    try {
      await fetch(`/api/watch-dirs/${id}/scan`, { method: 'POST', headers: authHeaders() });
      // After triggering, poll for progress
      setTimeout(fetchDirs, 800);
    } finally {
      setScanningId(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[90vw] max-w-lg z-50 p-7 flex flex-col gap-5">

          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0">
              <FolderSearch className="w-5 h-5 text-[#0071e3]" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-[16px] font-semibold text-[#1d1d1f]">从目录导入</Dialog.Title>
              <Dialog.Description className="text-[12px] text-[#86868b] mt-0.5 truncate">{kbName}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors text-[#86868b]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          {/* Description */}
          <p className="text-[12px] text-[#86868b] -mt-2">
            配置需要监控的服务器目录，Celery Beat 会定期扫描并将新文件导入到此知识库，目录结构与磁盘保持一致。
          </p>

          {/* Add directory */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={addPath}
                onChange={e => { setAddPath(e.target.value); setAddError(''); }}
                onKeyDown={e => { if (e.key === 'Enter' && !isAdding) handleAdd(); }}
                placeholder="服务器目录路径，如 /data/documents"
                className="flex-1 px-3 py-2 text-[13px] border border-[#d2d2d7] rounded-lg outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]/20 transition-all placeholder-[#86868b] text-[#1d1d1f]"
              />
              <button
                onClick={handleAdd}
                disabled={isAdding || !addPath.trim()}
                className="px-3 py-2 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                添加
              </button>
            </div>
            {addError && <p className="text-[12px] text-red-500">{addError}</p>}
          </div>

          {/* Directory list */}
          <div>
            <p className="text-[12px] font-medium text-[#86868b] mb-2.5">
              已配置目录
              {dirs.length > 0 && <span className="ml-1 text-[#0071e3]">{dirs.length}</span>}
            </p>
            {error && <p className="text-[12px] text-red-500 mb-2">{error}</p>}
            {isLoading ? (
              <div className="text-center py-6 text-[13px] text-[#86868b]">加载中...</div>
            ) : dirs.length === 0 ? (
              <div className="text-center py-6 text-[13px] text-[#86868b]">暂未配置监控目录</div>
            ) : (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {dirs.map(dir => {
                  const inProgress = dir.scan_total > 0 && dir.scan_done < dir.scan_total;
                  return (
                    <div
                      key={dir.id}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[#f5f5f7] border border-[#e8e8ed]"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{dir.name}</p>
                        <p className="text-[11px] text-[#86868b] truncate font-mono mb-0.5">{dir.fs_path}</p>
                        <ScanProgress dir={dir} />
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => handleScan(dir.id)}
                          disabled={scanningId === dir.id || inProgress}
                          className="p-1.5 rounded-lg hover:bg-[#e8e8ed] transition-colors text-[#86868b] disabled:opacity-40"
                          title={inProgress ? '扫描中...' : '立即扫描'}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${inProgress || scanningId === dir.id ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => handleDelete(dir.id)}
                          disabled={inProgress}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-[#86868b] hover:text-red-500 disabled:opacity-40"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
