import { useState, useEffect } from 'react';
import { MessageSquare, FileText } from 'lucide-react';

interface MyComment {
  id: number;
  file_id: number;
  file_name: string;
  uploader_name: string;
  parent_id: number | null;
  content: string;
  created_at: string;
}

interface FileGroup {
  file_id: number;
  file_name: string;
  uploader_name: string;
  comments: MyComment[];
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function MyComments() {
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/social/users/me/comments', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: MyComment[]) => {
        // 按 file_id 分组，保留每组最新评论在前
        const map = new Map<number, FileGroup>();
        for (const c of data) {
          if (!map.has(c.file_id)) {
            map.set(c.file_id, {
              file_id: c.file_id,
              file_name: c.file_name,
              uploader_name: c.uploader_name,
              comments: [],
            });
          }
          map.get(c.file_id)!.comments.push(c);
        }
        setGroups(Array.from(map.values()));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFileClick = (fileId: number) => {
    window.open(`/#preview/${fileId}`, '_blank');
  };

  return (
    <div className="size-full flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center px-8">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
          <h1 className="text-[21px] font-semibold text-[#1d1d1f]">我的评论</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#86868b]">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" strokeWidth={1} />
            <p className="text-[14px]">暂无评论记录</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.file_id} className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
                {/* File Header */}
                <div
                  onClick={() => handleFileClick(group.file_id)}
                  className="px-6 py-3 flex items-center justify-between bg-[#f5f5f7]/60 border-b border-[#d2d2d7]/50 cursor-pointer hover:bg-[#f0f0f5] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-[#0071e3] flex-shrink-0" strokeWidth={1.5} />
                    <span className="text-[14px] text-[#0071e3] font-medium hover:underline truncate">
                      {group.file_name}
                    </span>
                  </div>
                  <span className="text-[13px] text-[#86868b] flex-shrink-0 ml-4">{group.uploader_name}</span>
                </div>

                {/* Comments */}
                <div className="divide-y divide-[#d2d2d7]/30">
                  {group.comments.map((comment) => (
                    <div key={comment.id} className="pl-14 pr-6 py-3 flex items-start gap-4">
                      <div className="w-7 h-7 rounded-full bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-[#0071e3]" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-[#1d1d1f] leading-relaxed">{comment.content}</p>
                        <p className="text-[12px] text-[#86868b] mt-1">{formatDate(comment.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
