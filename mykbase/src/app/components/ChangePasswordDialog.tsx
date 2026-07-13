import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Eye, EyeOff, Lock } from 'lucide-react';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('请填写所有密码字段');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密码长度不能少于6位');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      if (res.status === 204) {
        handleClose();
        alert('密码修改成功，请重新登录');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || '修改失败，请重试');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-md z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#d2d2d7]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 flex items-center justify-center">
                <Lock className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
              </div>
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">
                修改密码
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            <div className="space-y-5">
              {/* Old Password */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  原密码
                </label>
                <div className="relative">
                  <input
                    type={showOldPassword ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="请输入原密码"
                    className="w-full px-4 py-2.5 bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white transition-colors"
                  >
                    {showOldPassword ? (
                      <EyeOff className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                    ) : (
                      <Eye className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  新密码
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="请输入新密码（至少6位）"
                    className="w-full px-4 py-2.5 bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white transition-colors"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                    ) : (
                      <Eye className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  确认新密码
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入新密码"
                    className="w-full px-4 py-2.5 bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                    ) : (
                      <Eye className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="text-[13px] text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
              )}

              {/* Password Requirements */}
              <div className="bg-[#0071e3]/5 rounded-xl p-4">
                <p className="text-[13px] text-[#86868b] leading-relaxed">
                  密码要求：
                </p>
                <ul className="mt-2 space-y-1 text-[13px] text-[#86868b]">
                  <li className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-[#86868b]"></span>
                    至少6位字符
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-[#86868b]"></span>
                    建议包含字母、数字和特殊字符
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#d2d2d7]">
            <Dialog.Close asChild>
              <button className="px-5 py-2 bg-white rounded-xl border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-all duration-150 text-[14px] font-medium">
                取消
              </button>
            </Dialog.Close>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-150 text-[14px] font-medium shadow-sm"
            >
              {isSubmitting ? '提交中...' : '确认修改'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
