import { useState, useEffect, useRef } from 'react';
import { FileText, FileImage, File, Key, Eye, EyeOff, AlertCircle, Clock } from 'lucide-react';
import { Viewer } from '@bytemd/react';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import 'bytemd/dist/index.css';
import 'highlight.js/styles/vs.css';

const viewerPlugins = [gfm(), highlight()];

interface ShareInfo {
  share_token: string;
  share_type: 'time' | 'password';
  file_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  expires_at: string | null;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

const IMAGE_TYPES  = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
const TEXT_TYPES   = new Set(['txt', 'md', 'csv', 'log', 'json', 'xml', 'yaml', 'yml', 'sql']);
const OFFICE_TYPES = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf']);

export function SharePreviewPage({ shareToken }: { shareToken: string }) {
  const [shareInfo, setShareInfo]     = useState<ShareInfo | null>(null);
  const [loadError, setLoadError]     = useState('');
  const [phase, setPhase]             = useState<'loading' | 'password' | 'preview'>('loading');

  // Password dialog
  const [pwdInput, setPwdInput]       = useState('');
  const [showPwd, setShowPwd]         = useState(false);
  const [pwdError, setPwdError]       = useState('');
  const [pwdChecking, setPwdChecking] = useState(false);
  const verifiedPwdRef                = useRef('');

  // Preview content
  const [blobUrl, setBlobUrl]         = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // 1. Fetch share info (no auth needed)
  useEffect(() => {
    fetch(`/api/social/shares/${shareToken}/public`)
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.detail || '链接无效'); });
        return r.json();
      })
      .then((info: ShareInfo) => {
        setShareInfo(info);
        document.title = `分享预览 · ${info.file_name}`;
        if (info.share_type === 'password') {
          setPhase('password');
        } else {
          setPhase('preview');
        }
      })
      .catch(e => setLoadError(e.message || '链接无效或已失效'));
  }, [shareToken]);

  // 2. Verify password
  const handleVerifyPassword = async () => {
    if (!pwdInput.trim()) { setPwdError('请输入密码'); return; }
    setPwdChecking(true);
    setPwdError('');
    try {
      const res = await fetch(`/api/social/shares/${shareToken}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwdInput }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setPwdError(d.detail || '密码错误');
        return;
      }
      verifiedPwdRef.current = pwdInput;
      setPhase('preview');
    } finally {
      setPwdChecking(false);
    }
  };

  // 3. Load file content once in preview phase
  useEffect(() => {
    if (phase !== 'preview' || !shareInfo) return;
    const ext = shareInfo.file_type.toLowerCase();
    const isText   = TEXT_TYPES.has(ext);
    const isPdf    = ext === 'pdf';
    const isImage  = IMAGE_TYPES.has(ext);
    const isOffice = OFFICE_TYPES.has(ext);
    if (!isText && !isPdf && !isImage && !isOffice) return;

    let cancelled = false;
    setContentLoading(true);
    const pwdParam = verifiedPwdRef.current
      ? `?password=${encodeURIComponent(verifiedPwdRef.current)}`
      : '';
    const url = `/api/social/shares/${shareToken}/content${pwdParam}`;

    fetch(url)
      .then(async res => {
        if (cancelled) return;
        if (isText) {
          const text = await res.text();
          if (!cancelled) setPreviewText(text);
        } else {
          const blob = await res.blob();
          if (!cancelled) setBlobUrl(URL.createObjectURL(blob));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setContentLoading(false); });

    return () => { cancelled = true; };
  }, [phase, shareInfo, shareToken]);

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  // ── Error state ──
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#f5f5f7]">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-400" strokeWidth={1.5} />
        </div>
        <p className="text-[17px] font-semibold text-[#1d1d1f]">链接无效或已失效</p>
        <p className="text-[14px] text-[#86868b]">{loadError}</p>
      </div>
    );
  }

  // ── Initial loading ──
  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f5f5f7]">
        <svg className="animate-spin w-8 h-8 text-[#0071e3]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  // ── Password gate ──
  if (phase === 'password') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f5f5f7]">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-[400px] max-w-[90vw] p-8 flex flex-col items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[#0071e3]/10 flex items-center justify-center">
            <Key className="w-7 h-7 text-[#0071e3]" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-[17px] font-semibold text-[#1d1d1f] mb-1">受密码保护</p>
            <p className="text-[13px] text-[#86868b] truncate max-w-[280px]">
              {shareInfo?.file_name}
            </p>
          </div>
          <div className="w-full relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={pwdInput}
              onChange={e => { setPwdInput(e.target.value); setPwdError(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && !pwdChecking) handleVerifyPassword(); }}
              placeholder="请输入查看密码"
              autoFocus
              className="w-full px-4 py-3 pr-10 border border-[#d2d2d7] rounded-xl text-[14px] text-[#1d1d1f] placeholder-[#86868b] outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]/20 transition-all"
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
          {pwdError && (
            <p className="text-[13px] text-red-500 -mt-2">{pwdError}</p>
          )}
          <button
            onClick={handleVerifyPassword}
            disabled={pwdChecking || !pwdInput.trim()}
            className="w-full py-3 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-xl text-[14px] font-medium transition-colors"
          >
            {pwdChecking ? '验证中...' : '查看文件'}
          </button>
        </div>
      </div>
    );
  }

  // ── File preview ──
  const ext      = shareInfo!.file_type.toLowerCase();
  const isImage  = IMAGE_TYPES.has(ext);
  const isPdf    = ext === 'pdf';
  const isText   = TEXT_TYPES.has(ext);
  const isOffice = OFFICE_TYPES.has(ext);
  const canPreview = isImage || isPdf || isText || isOffice;

  return (
    // user-select:none + pointer-events on text prevent copy
    <div
      className="flex flex-col h-screen bg-white"
      style={{ userSelect: 'none' }}
      onCopy={e => e.preventDefault()}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#d2d2d7] flex-shrink-0 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0">
            {isImage
              ? <FileImage className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
              : <FileText className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
            }
          </div>
          <h1 className="text-[14px] font-semibold text-[#1d1d1f] truncate max-w-[50vw]">
            {shareInfo!.file_name}
          </h1>
          <span className="hidden sm:flex items-center gap-3 text-[12px] text-[#86868b] ml-2 flex-shrink-0">
            <span>{ext.toUpperCase()}</span>
            <span>{formatSize(shareInfo!.file_size)}</span>
            {shareInfo!.expires_at && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" strokeWidth={1.5} />
                {new Date(shareInfo!.expires_at).toLocaleDateString('zh-CN')} 到期
              </span>
            )}
          </span>
        </div>
        <span className="text-[12px] text-[#86868b] bg-[#f5f5f7] px-3 py-1 rounded-full flex-shrink-0">
          {shareInfo!.share_type === 'password' ? '🔑 密钥分享' : '⏱ 时效分享'} · 只读
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {contentLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <svg className="animate-spin w-8 h-8 text-[#0071e3]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-[14px] text-[#86868b]">
              {isOffice ? '正在转换为 PDF，请稍候...' : '加载预览中...'}
            </span>
          </div>
        ) : isImage && blobUrl ? (
          <div className="flex items-center justify-center h-full p-8 overflow-auto bg-[#f5f5f7]">
            <img
              src={blobUrl}
              alt={shareInfo!.file_name}
              className="max-w-full max-h-full object-contain rounded-lg shadow"
              draggable={false}
            />
          </div>
        ) : (isPdf || isOffice) && blobUrl ? (
          // PDF in iframe — toolbar hidden to block in-browser download
          <iframe
            src={`${blobUrl}#toolbar=0&navpanes=0`}
            className="w-full h-full border-0"
            title={shareInfo!.file_name}
          />
        ) : isText && previewText !== null ? (
          ext === 'md' ? (
            <div className="h-full overflow-auto">
              <div className="max-w-3xl mx-auto px-8 py-6">
                <Viewer value={previewText} plugins={viewerPlugins} />
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <pre className="p-6 text-[13px] text-[#1d1d1f] font-mono leading-relaxed whitespace-pre-wrap break-words">
                {previewText}
              </pre>
            </div>
          )
        ) : !canPreview ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-2xl bg-[#0071e3]/10 flex items-center justify-center mb-5">
              <File className="w-10 h-10 text-[#0071e3]" strokeWidth={1} />
            </div>
            <p className="text-[17px] font-semibold text-[#1d1d1f] mb-2">{shareInfo!.file_name}</p>
            <p className="text-[14px] text-[#86868b]">
              {ext.toUpperCase()} 格式暂不支持在线预览
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
