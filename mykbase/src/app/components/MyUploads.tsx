import { useState, useEffect } from 'react';
import { Upload, FileText } from 'lucide-react';

interface UploadedFile {
  id: number;
  name: string;
  file_type: string;
  file_size: number;
  process_status: string;
  created_at: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + units[i];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return `今天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays === 1) return `昨天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:    { label: '等待处理', color: 'text-[#86868b] bg-[#f5f5f7]' },
  processing: { label: '处理中',   color: 'text-[#0071e3] bg-[#0071e3]/10' },
  completed:  { label: '已完成',   color: 'text-[#34c759] bg-[#34c759]/10' },
  failed:     { label: '处理失败', color: 'text-red-500 bg-red-50' },
};

export function MyUploads() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/files/me', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setFiles(Array.isArray(data.items) ? data.items : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleClick = (file: UploadedFile) => {
    window.open(`/#preview/${file.id}`, '_blank');
  };

  return (
    <div className="size-full flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center px-8">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
          <h1 className="text-[21px] font-semibold text-[#1d1d1f]">我上传的文件</h1>
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
            <Upload className="w-12 h-12 mb-3 opacity-30" strokeWidth={1} />
            <p className="text-[14px]">暂无上传记录</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f5f5f7] border-b border-[#d2d2d7]">
                  <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">名称</th>
                  <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">类型</th>
                  <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">大小</th>
                  <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">状态</th>
                  <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">上传时间</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => {
                  const status = STATUS_CONFIG[file.process_status] ?? { label: file.process_status, color: 'text-[#86868b] bg-[#f5f5f7]' };
                  return (
                    <tr
                      key={file.id}
                      onClick={() => handleClick(file)}
                      className="border-b border-[#d2d2d7]/50 last:border-0 hover:bg-[#f5f5f7]/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-[#0071e3] flex-shrink-0" strokeWidth={1.5} />
                          <span className="text-[14px] text-[#1d1d1f] line-clamp-1">{file.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-[14px] text-[#86868b] whitespace-nowrap">{file.file_type.toUpperCase()}</td>
                      <td className="px-6 py-3 text-[14px] text-[#86868b] whitespace-nowrap">{formatSize(file.file_size)}</td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[12px] font-medium ${status.color}`}>{status.label}</span>
                      </td>
                      <td className="px-6 py-3 text-[14px] text-[#86868b] whitespace-nowrap">{formatDate(file.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
