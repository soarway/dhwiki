import { useState, useEffect } from 'react';
import { ThumbsUp, FileText } from 'lucide-react';

interface LikedFile {
  id: number;
  file_id: number;
  file_name: string;
  uploader_name: string;
  created_at: string;
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

export function MyLikes() {
  const [files, setFiles]       = useState<LikedFile[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setLoading(true);
    fetch('/api/social/users/me/likes', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setFiles(Array.isArray(data) ? data : []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  const totalItems = files.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paged = files.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="size-full flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <ThumbsUp className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
          <h1 className="text-[21px] font-semibold text-[#1d1d1f]">我的点赞</h1>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <svg className="animate-spin w-7 h-7 text-[#0071e3]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ThumbsUp className="w-12 h-12 text-[#d2d2d7]" strokeWidth={1} />
            <p className="text-[14px] text-[#86868b]">暂无点赞记录</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f5f5f7] border-b border-[#d2d2d7]">
                    <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">名称</th>
                    <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">上传者</th>
                    <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">点赞时间</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((file) => (
                    <tr
                      key={file.id}
                      className="border-b border-[#d2d2d7]/50 hover:bg-[#f5f5f7]/50 transition-colors cursor-pointer"
                      onClick={() => window.open(`/#preview/${file.file_id}`, '_blank')}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-[#0071e3] flex-shrink-0" strokeWidth={1.5} />
                          <span className="text-[14px] text-[#1d1d1f] truncate max-w-[480px]">{file.file_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-[14px] text-[#1d1d1f]">{file.uploader_name || '—'}</td>
                      <td className="px-6 py-3 text-[14px] text-[#86868b] whitespace-nowrap">{formatTime(file.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-end gap-4">
              <div className="text-[14px] text-[#86868b]">
                共 <span className="text-[#1d1d1f] font-medium">{totalItems}</span> 条
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                  className="w-8 h-8 rounded-lg bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] text-[14px] disabled:opacity-50 disabled:cursor-not-allowed">&lt;&lt;</button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="w-8 h-8 rounded-lg bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] text-[14px] disabled:opacity-50 disabled:cursor-not-allowed">&lt;</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p >= currentPage - 1 && p <= currentPage + 1)
                  .map(page => (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-[14px] ${currentPage === page ? 'bg-[#0071e3] text-white' : 'bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]'}`}>
                      {page}
                    </button>
                  ))}
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-lg bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] text-[14px] disabled:opacity-50 disabled:cursor-not-allowed">&gt;</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-lg bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] text-[14px] disabled:opacity-50 disabled:cursor-not-allowed">&gt;&gt;</button>
              </div>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3]">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
