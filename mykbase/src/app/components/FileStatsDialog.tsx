import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, BarChart2, ThumbsUp, Star, MessageSquare, Share2 } from 'lucide-react';

interface UserBrief { id: number; username: string; real_name: string; }

interface Stats {
  like_count: number;
  favorite_count: number;
  comment_count: number;
  share_count: number;
  liked_users: UserBrief[];
  favorited_users: UserBrief[];
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

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 py-4 px-5 rounded-xl bg-[#f5f5f7]`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <span className="text-[22px] font-bold text-[#1d1d1f]">{value}</span>
      <span className="text-[12px] text-[#86868b]">{label}</span>
    </div>
  );
}

function UserList({ title, users }: { title: string; users: UserBrief[] }) {
  if (users.length === 0) return null;
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-[#1d1d1f] mb-2">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {users.map(u => (
          <span key={u.id} className="px-3 py-1 bg-[#f5f5f7] rounded-full text-[12px] text-[#1d1d1f]">
            {u.real_name || u.username}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FileStatsDialog({ fileId, fileName, open, onClose }: Props) {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [isLoading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/social/files/${fileId}/stats`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, fileId]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[520px] max-w-[95vw] max-h-[85vh] flex flex-col outline-none">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#d2d2d7] flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
              </div>
              <Dialog.Title className="text-[15px] font-semibold text-[#1d1d1f]">统计信息</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                <X className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <p className="text-[13px] text-[#86868b] truncate">
              文件：<span className="text-[#1d1d1f] font-medium">{fileName}</span>
            </p>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <svg className="animate-spin w-7 h-7 text-[#0071e3]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            ) : stats ? (
              <>
                {/* Count cards */}
                <div className="grid grid-cols-4 gap-3">
                  <StatCard
                    icon={<Share2 className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />}
                    label="分享次数" value={stats.share_count} color="bg-[#0071e3]/10"
                  />
                  <StatCard
                    icon={<ThumbsUp className="w-4 h-4 text-[#ff6b35]" strokeWidth={1.5} />}
                    label="点赞次数" value={stats.like_count} color="bg-[#ff6b35]/10"
                  />
                  <StatCard
                    icon={<Star className="w-4 h-4 text-[#ffd60a]" strokeWidth={1.5} />}
                    label="收藏次数" value={stats.favorite_count} color="bg-[#ffd60a]/10"
                  />
                  <StatCard
                    icon={<MessageSquare className="w-4 h-4 text-[#34c759]" strokeWidth={1.5} />}
                    label="评论数量" value={stats.comment_count} color="bg-[#34c759]/10"
                  />
                </div>

                {/* User lists */}
                <div className="space-y-4 pt-2">
                  <UserList title={`点赞用户（${stats.liked_users.length}人）`} users={stats.liked_users} />
                  <UserList title={`收藏用户（${stats.favorited_users.length}人）`} users={stats.favorited_users} />
                  {stats.liked_users.length === 0 && stats.favorited_users.length === 0 && (
                    <p className="text-[13px] text-[#86868b] text-center py-4">暂无互动数据</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-[13px] text-[#86868b] text-center py-8">加载失败</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
