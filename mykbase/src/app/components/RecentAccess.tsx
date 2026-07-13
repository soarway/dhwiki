import { useState, useEffect } from 'react';
import { Clock, FileText } from 'lucide-react';

interface RecentFile {
  id: number;
  file_id: number;
  file_name: string;
  uploader_name: string;
  accessed_at: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return `今天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays === 1) return `昨天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function RecentAccess() {
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/social/users/me/recent', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setFiles(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleClick = (file: RecentFile) => {
    // 记录访问日志（fire and forget）
    fetch(`/api/social/files/${file.file_id}/access`, {
      method: 'POST',
      headers: authHeaders(),
    }).catch(() => {});
    window.open(`/#preview/${file.file_id}`, '_blank');
  };

  return (
    <div className="size-full flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
          <h1 className="text-[21px] font-semibold text-[#1d1d1f]">最近访问</h1>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#86868b]">
            <Clock className="w-12 h-12 mb-3 opacity-30" strokeWidth={1} />
            <p className="text-[14px]">暂无最近访问记录</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f5f5f7] border-b border-[#d2d2d7]">
                  <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">名称</th>
                  <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">上传者</th>
                  <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">访问时间</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr
                    key={file.id}
                    onClick={() => handleClick(file)}
                    className="border-b border-[#d2d2d7]/50 hover:bg-[#f5f5f7]/50 transition-colors cursor-pointer last:border-0"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-[#0071e3] flex-shrink-0" strokeWidth={1.5} />
                        <span className="text-[14px] text-[#1d1d1f] line-clamp-1">{file.file_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-[14px] text-[#86868b] whitespace-nowrap">{file.uploader_name}</td>
                    <td className="px-6 py-3 text-[14px] text-[#86868b] whitespace-nowrap">{formatDate(file.accessed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
