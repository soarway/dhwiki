import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Copy, Check, Share2, Clock, Key, Eye, EyeOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  fileId: number;
  fileName: string;
  open: boolean;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: '1 天', days: 1 },
  { label: '7 天', days: 7 },
  { label: '30 天', days: 30 },
  { label: '永不过期', days: 0 },
];

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function FileShareDialog({ fileId, fileName, open, onClose }: Props) {
  const [shareMode, setShareMode]       = useState<'time' | 'password'>('time');
  const [selectedDays, setSelectedDays] = useState(7);
  const [password, setPassword]         = useState('');
  const [showPwd, setShowPwd]           = useState(false);
  const [shareUrl, setShareUrl]         = useState('');
  const [isCreating, setIsCreating]     = useState(false);
  const [copied, setCopied]             = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    if (open) {
      setShareUrl('');
      setError('');
      setCopied(false);
      setShareMode('time');
      setSelectedDays(7);
      setPassword('');
      setShowPwd(false);
    }
  }, [open]);

  const createShare = async () => {
    if (shareMode === 'password' && !password.trim()) {
      setError('请输入查看密码');
      return;
    }
    setIsCreating(true);
    setError('');
    try {
      const expiresAt = shareMode === 'time' && selectedDays > 0
        ? new Date(Date.now() + selectedDays * 86400 * 1000).toISOString()
        : null;
      const res = await fetch('/api/social/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          file_id: fileId,
          expires_at: expiresAt,
          share_type: shareMode,
          share_password: shareMode === 'password' ? password.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error('创建失败');
      const data = await res.json();
      const url = `${window.location.origin}/#share/${data.share_token}`;
      setShareUrl(url);
    } catch {
      setError('创建分享链接失败，请重试');
    } finally {
      setIsCreating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[480px] max-w-[95vw] outline-none">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#d2d2d7]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 flex items-center justify-center">
                <Share2 className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
              </div>
              <Dialog.Title className="text-[15px] font-semibold text-[#1d1d1f]">分享文件</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                <X className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* File name */}
            <p className="text-[13px] text-[#86868b] truncate">
              文件：<span className="text-[#1d1d1f] font-medium">{fileName}</span>
            </p>

            {/* Mode toggle */}
            <div className="flex gap-2 p-1 bg-[#f5f5f7] rounded-xl">
              <button
                onClick={() => { setShareMode('time'); setShareUrl(''); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  shareMode === 'time'
                    ? 'bg-white text-[#1d1d1f] shadow-sm'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                按时间分享
              </button>
              <button
                onClick={() => { setShareMode('password'); setShareUrl(''); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  shareMode === 'password'
                    ? 'bg-white text-[#1d1d1f] shadow-sm'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                <Key className="w-3.5 h-3.5" strokeWidth={1.5} />
                按密钥分享
              </button>
            </div>

            {/* Time mode: expiry selector */}
            {shareMode === 'time' && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Clock className="w-3.5 h-3.5 text-[#86868b]" strokeWidth={1.5} />
                  <span className="text-[13px] text-[#86868b]">有效期</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {EXPIRY_OPTIONS.map(opt => (
                    <button
                      key={opt.days}
                      onClick={() => { setSelectedDays(opt.days); setShareUrl(''); }}
                      className={`py-2 rounded-lg text-[13px] font-medium border transition-colors ${
                        selectedDays === opt.days
                          ? 'bg-[#0071e3] text-white border-[#0071e3]'
                          : 'bg-white text-[#1d1d1f] border-[#d2d2d7] hover:border-[#0071e3] hover:text-[#0071e3]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Password mode: password input */}
            {shareMode === 'password' && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Key className="w-3.5 h-3.5 text-[#86868b]" strokeWidth={1.5} />
                  <span className="text-[13px] text-[#86868b]">查看密码</span>
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setShareUrl(''); setError(''); }}
                    placeholder="设置访问密码（访问者需输入此密码）"
                    className="w-full px-3 py-2.5 pr-10 border border-[#d2d2d7] rounded-xl text-[13px] text-[#1d1d1f] placeholder-[#86868b] outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f]"
                  >
                    {showPwd
                      ? <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                      : <Eye className="w-4 h-4" strokeWidth={1.5} />
                    }
                  </button>
                </div>
                <p className="text-[11px] text-[#86868b] mt-1.5">
                  链接永久有效，访问者须凭密码查看，无下载权限
                </p>
              </div>
            )}

            {/* Generate button */}
            {!shareUrl && (
              <button
                onClick={createShare}
                disabled={isCreating || (shareMode === 'password' && !password.trim())}
                className="w-full py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-xl text-[14px] font-medium transition-colors"
              >
                {isCreating ? '生成中...' : '生成分享链接'}
              </button>
            )}

            {error && <p className="text-[13px] text-red-500 text-center">{error}</p>}

            {/* Share result */}
            {shareUrl && (
              <div className="space-y-4">
                {/* Copy link */}
                <div className="flex items-center gap-2 bg-[#f5f5f7] rounded-xl px-3 py-2.5">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-transparent text-[12px] text-[#1d1d1f] outline-none truncate"
                  />
                  <button
                    onClick={copyLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[12px] font-medium transition-colors flex-shrink-0"
                  >
                    {copied
                      ? <><Check className="w-3.5 h-3.5" strokeWidth={2} /> 已复制</>
                      : <><Copy className="w-3.5 h-3.5" strokeWidth={1.5} /> 复制链接</>
                    }
                  </button>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-2 py-2">
                  <QRCodeSVG value={shareUrl} size={160} level="M" />
                  <p className="text-[12px] text-[#86868b]">扫码访问文件</p>
                </div>

                <p className="text-[12px] text-[#86868b] text-center">
                  {shareMode === 'password'
                    ? '链接永久有效，访问者需凭密码查看，只读无下载'
                    : selectedDays > 0
                      ? `链接有效期 ${selectedDays} 天，仅限只读访问`
                      : '链接永久有效，仅限只读访问'}
                </p>

                {/* Re-generate */}
                <button
                  onClick={() => setShareUrl('')}
                  className="w-full py-2 text-[13px] text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                >
                  重新生成
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
