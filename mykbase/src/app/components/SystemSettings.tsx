import { useState, useEffect, useRef } from 'react';
import { Settings, Clock, ImageIcon, Upload, Lock } from 'lucide-react';

function applyFavicon(logoDataUrl: string) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const scale = Math.min(32 / img.width, 32 / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (32 - w) / 2, (32 - h) / 2, w, h);
    const faviconUrl = canvas.toDataURL('image/png');
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  };
  img.src = logoDataUrl;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface SystemSettingsProps {
  onLogoChange?: (logo: string | null) => void;
  onNameChange?: (name: string) => void;
}

export function SystemSettings({ onLogoChange, onNameChange }: SystemSettingsProps) {
  const [sessionExpireHours, setSessionExpireHours] = useState('8');
  const [uploadRetentionDays, setUploadRetentionDays] = useState('3');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [systemName, setSystemName] = useState('icanfly');
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');
  const logoFileRef = useRef<HTMLInputElement>(null);

  // 从后端加载设置
  useEffect(() => {
    fetch('/api/settings', { headers: authHeaders() })
      .then((res) => res.ok ? res.json() : [])
      .then((settings: { key: string; value: string }[]) => {
        const get = (key: string, fallback: string) =>
          settings.find((s) => s.key === key)?.value ?? fallback;
        setSessionExpireHours(get('session_expire_hours', '8'));
        setUploadRetentionDays(get('file_delete_protect_days', '3'));
        const logo = settings.find((s) => s.key === 'system_logo')?.value;
        if (logo) { setLogoPreview(logo); applyFavicon(logo); }
        const name = settings.find((s) => s.key === 'system_name')?.value;
        if (name) setSystemName(name);
      });
  }, []);

  const saveSetting = async (key: string, value: string) => {
    const res = await fetch(`/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ value }),
    });
    // 如果 key 不存在后端会返回 404，忽略即可（后端用 get_setting_value 有默认值）
    return res;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMsg('');
    try {
      await Promise.all([
        saveSetting('session_expire_hours', sessionExpireHours),
        saveSetting('file_delete_protect_days', uploadRetentionDays),
      ]);
      setSaveMsg('设置已保存');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch {
      setSaveMsg('保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoMsg('请选择图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 400;
        const MAX_H = 120;
        const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setLogoPreview(canvas.toDataURL('image/png'));
        setLogoMsg('');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogo = async () => {
    setIsSavingLogo(true);
    setLogoMsg('');
    try {
      const saves: Promise<Response>[] = [
        saveSetting('system_name', systemName),
      ];
      if (logoPreview) saves.push(saveSetting('system_logo', logoPreview));
      const results = await Promise.all(saves);
      if (results.every(r => r.ok)) {
        onLogoChange?.(logoPreview);
        onNameChange?.(systemName);
        if (logoPreview) applyFavicon(logoPreview);
        setLogoMsg('已保存');
        setTimeout(() => setLogoMsg(''), 2500);
      } else {
        setLogoMsg('保存失败，请重试');
      }
    } catch {
      setLogoMsg('网络错误，请重试');
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleResetLogo = () => {
    setLogoPreview(null);
    setLogoMsg('');
    onLogoChange?.(null);
    if (logoFileRef.current) logoFileRef.current.value = '';
  };

  const handleReset = () => {
    setSessionExpireHours('8');
    setUploadRetentionDays('3');
    setSaveMsg('');
  };

  return (
    <div className="size-full flex flex-col overflow-hidden bg-[#f5f5f7]">
      {/* Top Bar */}
      <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
          <h1 className="text-[21px] font-semibold text-[#1d1d1f]">系统设置</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* File Management Section */}
          <div className="bg-white rounded-2xl border border-[#d2d2d7] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#d2d2d7] bg-[#fbfbfd]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                </div>
                <h2 className="text-[17px] font-semibold text-[#1d1d1f]">文件管理</h2>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-[15px] font-medium text-[#1d1d1f] block mb-1">
                    文件删除保护期
                  </label>
                  <p className="text-[13px] text-[#86868b]">
                    上传者在此天数内可删除自己上传的文件，超过后仅超级管理员可删除
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-6">
                  <input
                    type="number"
                    value={uploadRetentionDays}
                    onChange={(e) => setUploadRetentionDays(e.target.value)}
                    min="0"
                    className="w-24 px-4 py-2 bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] text-center"
                  />
                  <span className="text-[14px] text-[#86868b]">天</span>
                </div>
              </div>
            </div>
          </div>

          {/* Session Security Section */}
          <div className="bg-white rounded-2xl border border-[#d2d2d7] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#d2d2d7] bg-[#fbfbfd]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#34c759]/10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-[#34c759]" strokeWidth={1.5} />
                </div>
                <h2 className="text-[17px] font-semibold text-[#1d1d1f]">会话安全</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-[15px] font-medium text-[#1d1d1f] block mb-1">
                    会话超时时间
                  </label>
                  <p className="text-[13px] text-[#86868b]">
                    用户登录后的会话有效期，超时后需要重新登录。修改后仅对新登录生效，不影响当前已登录的会话
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-6">
                  <input
                    type="number"
                    value={sessionExpireHours}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setSessionExpireHours(String(Math.min(Math.max(v, 1), 720)));
                    }}
                    min="1"
                    max="720"
                    className="w-24 px-4 py-2 bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#34c759]/30 focus:border-[#34c759] transition-all text-[14px] text-[#1d1d1f] text-center"
                  />
                  <span className="text-[14px] text-[#86868b]">小时</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {[1, 4, 8, 12, 24, 48, 72].map((h) => (
                  <button
                    key={h}
                    onClick={() => setSessionExpireHours(String(h))}
                    className={`px-3 py-1 rounded-lg text-[12px] font-medium border transition-all ${
                      sessionExpireHours === String(h)
                        ? 'bg-[#34c759] text-white border-[#34c759]'
                        : 'bg-[#f5f5f7] text-[#86868b] border-[#d2d2d7] hover:border-[#34c759]/40'
                    }`}
                  >
                    {h >= 24 ? `${h / 24}天` : `${h}小时`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* System Logo Section */}
          <div className="bg-white rounded-2xl border border-[#d2d2d7] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#d2d2d7] bg-[#fbfbfd]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#af52de]/10 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-[#af52de]" strokeWidth={1.5} />
                </div>
                <h2 className="text-[17px] font-semibold text-[#1d1d1f]">系统 LOGO</h2>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {/* Preview */}
              <div className="flex flex-col items-start gap-3">
                <p className="text-[13px] text-[#86868b]">当前 LOGO（显示在侧边栏顶部）</p>
                <div className="flex items-center gap-4">
                  <div className="w-40 h-14 rounded-xl border border-[#d2d2d7] bg-[#f5f5f7] flex items-center justify-center overflow-hidden px-3">
                    {logoPreview ? (
                      <img src={logoPreview} alt="LOGO 预览" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-[13px] text-[#86868b]">暂无 LOGO</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={logoFileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => logoFileRef.current?.click()}
                      className="px-4 py-2 bg-[#0071e3]/10 hover:bg-[#0071e3]/15 text-[#0071e3] rounded-xl transition-all duration-150 flex items-center gap-2 text-[13px] font-medium border border-[#0071e3]/20"
                    >
                      <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
                      选择图片
                    </button>
                    {logoPreview && (
                      <button
                        onClick={handleResetLogo}
                        className="px-4 py-2 bg-white hover:bg-[#f5f5f7] text-[#86868b] rounded-xl transition-all duration-150 flex items-center gap-2 text-[13px] font-medium border border-[#d2d2d7]"
                      >
                        移除 LOGO
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-[#86868b]">支持 PNG、JPG，建议使用透明背景 PNG，高度 64px 以上</p>
              </div>
              {/* System Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-[#1d1d1f]">系统名称（显示在 LOGO 右侧，建议 4 字以内）</label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value.slice(0, 6))}
                    maxLength={6}
                    placeholder="如：有木知识"
                    className="w-40 px-3 py-2 bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                  />
                  <span className="text-[12px] text-[#86868b]">{systemName.length}/6</span>
                </div>
              </div>

              {/* Save Logo Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveLogo}
                  disabled={isSavingLogo}
                  className="px-5 py-2 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-150 text-[13px] font-medium shadow-sm"
                >
                  {isSavingLogo ? '保存中...' : '保存'}
                </button>
                {logoMsg && (
                  <span className={`text-[13px] ${logoMsg.includes('失败') || logoMsg.includes('错误') ? 'text-red-500' : 'text-[#34c759]'}`}>
                    {logoMsg}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4">
            {saveMsg && (
              <span className={`text-[14px] ${saveMsg.includes('失败') ? 'text-red-500' : 'text-[#34c759]'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={handleReset}
              className="px-6 py-2.5 bg-white rounded-xl border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-all duration-150 text-[14px] font-medium"
            >
              重置
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-150 text-[14px] font-medium shadow-sm"
            >
              {isSaving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
