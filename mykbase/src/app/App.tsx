import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FilePreviewPage } from './components/FilePreviewPage';
import { SharePreviewPage } from './components/SharePreviewPage';
import { Sidebar } from './components/Sidebar';
import { KnowledgeBaseCard, NewKnowledgeBaseCard } from './components/KnowledgeBaseCard';
import type { KnowledgeBaseCardHandle } from './components/KnowledgeBaseCard';
import { Login } from './components/Login';
import { DepartmentManagement } from './components/DepartmentManagement';
import { UserManagement } from './components/UserManagement';
import { RoleManagement } from './components/RoleManagement';
import { KnowledgeBaseDetail } from './components/KnowledgeBaseDetail';
import { NewKnowledgeBaseDialog } from './components/NewKnowledgeBaseDialog';
import { OpenPlatform } from './components/OpenPlatform';
import { AEOHomePage } from './components/AEOHomePage';
import { RecentAccess } from './components/RecentAccess';
import { MyFavorites } from './components/MyFavorites';
import { MyLikes } from './components/MyLikes';
import { MyComments } from './components/MyComments';
import { MyUploads } from './components/MyUploads';
import { MyAIConversations } from './components/MyAIConversations';
import { SystemSettings } from './components/SystemSettings';
import { Search, Plus, Home as HomeIcon, X, FileText, BotMessageSquare, Upload } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface KbItem {
  id: number;
  name: string;
  description: string | null;
  file_count: number;
  total_size: number;
  dept_id: number | null;
  dept_manager_user_id: number | null;
  created_by: number | null;
  sort_order: number | null;
}

interface FileSearchResult {
  id: number;
  name: string;
  file_type: string;
  file_size: number;
  process_status: string;
  created_at: string;
  kb_id: number | null;
  kb_name: string | null;
  uploader_name: string | null;
}

interface GlobalStats {
  kb_count: number;
  file_count: number;
  total_size: number;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function authGet(url: string) {
  return fetch(url, { headers: getAuthHeaders() });
}

// ── Hash-based routing ────────────────────────────────────────────────────────
// /#preview/<fileId>  — internal file preview (requires login)
// /#share/<token>     — public share preview (no login required)
function parseHash(): { type: 'preview'; fileId: number } | { type: 'share'; token: string } | null {
  const hash = window.location.hash;
  const previewM = hash.match(/^#preview\/(\d+)/);
  if (previewM) return { type: 'preview', fileId: parseInt(previewM[1], 10) };
  const shareM = hash.match(/^#share\/([A-Za-z0-9_-]+)/);
  if (shareM) return { type: 'share', token: shareM[1] };
  return null;
}

// ── Global 401 interceptor ────────────────────────────────────────────────────
// Installed once at the top level (not inside MainApp) so it catches every
// authenticated request regardless of which sub-component fires it.
// On 401 we clear tokens and reload — this guarantees the login page appears.
(function install401Interceptor() {
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function interceptedFetch(input, init) {
    const res = await _origFetch(input, init);
    if (res.status === 401 && localStorage.getItem('access_token')) {
      // Only react to our own authenticated requests (not the share public API)
      const hdrs = init?.headers as Record<string, string> | undefined;
      const hasAuth = hdrs?.['Authorization'] || hdrs?.['authorization'];
      if (hasAuth) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        // Use replace so the back button doesn't loop
        window.location.replace(window.location.pathname + window.location.search);
      }
    }
    return res;
  };
})();

export default function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const handler = () => setRoute(parseHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (route?.type === 'preview') return <FilePreviewPage fileId={route.fileId} />;
  if (route?.type === 'share')   return <SharePreviewPage shareToken={route.token} />;
  return <MainApp />;
}

const PAGE_TITLES: Record<string, string> = {
  home: '知识库首页',
  aeo_home: 'AEO首页',
  aeo_basic: '基本信息',
  aeo_trade: '进出口',
  aeo_audit: '内审及整改',
  aeo_finance: '财务',
  aeo_location: '场所',
  aeo_hr: '人事',
  aeo_cargo: '货物收发',
  aeo_vehicle: '运输工具',
  aeo_partner: '商业伙伴',
  aeo_training: '培训',
};

const GENERAL_TAG = 'general';

function MainApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeItem, setActiveItem] = useState('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<{ id: number; name: string } | null>(null);
  const [newKnowledgeBaseDialogOpen, setNewKnowledgeBaseDialogOpen] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KbItem[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({ kb_count: 0, file_count: 0, total_size: 0 });
  const [systemLogo, setSystemLogo] = useState<string | null>(null);
  const [systemName, setSystemName] = useState('icanfly');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isCurrentUserSuperAdmin, setIsCurrentUserSuperAdmin] = useState(false);
  const [searchFileName, setSearchFileName] = useState('');
  const [searchUploader, setSearchUploader] = useState('');
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const detailCardRef = useRef<KnowledgeBaseCardHandle>(null);

  // AEO 插件检测状态
  const [aeoDetecting, setAeoDetecting] = useState(false);
  const [aeoDetectResult, setAeoDetectResult] = useState<{ result: 'pass' | 'fail'; detail?: string } | null>(null);
  const [aeoDetectResultOpen, setAeoDetectResultOpen] = useState(false);
  const [aeoUploading, setAeoUploading] = useState(false);
  const aeoUploadInputRef = useRef<HTMLInputElement>(null);

  const loadHomeData = useCallback(async (dirTag = 'general') => {
    const [kbRes, statsRes] = await Promise.all([
      authGet(`/api/knowledge-bases?dir_tag=${dirTag}`),
      authGet(`/api/knowledge-bases/stats?dir_tag=${dirTag}`),
    ]);
    if (kbRes.ok) setKnowledgeBases(await kbRes.json());
    if (statsRes.ok) setGlobalStats(await statsRes.json());
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      setIsLoggedIn(true);
    }
  }, []);

  const currentDirTag = useMemo(
    () => (activeItem === 'home' ? GENERAL_TAG : activeItem.startsWith('aeo_') ? activeItem : GENERAL_TAG),
    [activeItem]
  );

  useEffect(() => {
    if (isLoggedIn) {
      loadHomeData(currentDirTag);
      // 加载当前用户信息
      fetch('/api/auth/me', { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(u => {
          if (u) {
            setCurrentUserId(u.id);
            setIsCurrentUserSuperAdmin(u.is_super_admin ?? false);
          }
        })
        .catch(() => {});
      // 加载系统 LOGO
      fetch('/api/settings', { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : [])
        .then((settings: { key: string; value: string }[]) => {
          const logo = settings.find(s => s.key === 'system_logo')?.value;
          if (logo) setSystemLogo(logo);
          const name = settings.find(s => s.key === 'system_name')?.value;
          if (name) setSystemName(name);
        })
        .catch(() => {});
    }
  }, [isLoggedIn, loadHomeData, currentDirTag]);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setIsLoggedIn(false);
    setActiveItem('home');
    setSelectedKnowledgeBase(null);
  }, []);


  const handleSearchFiles = useCallback(async () => {
    if (!searchFileName.trim() && !searchUploader.trim()) return;
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchFileName.trim()) params.set('name', searchFileName.trim());
      if (searchUploader.trim()) params.set('uploader', searchUploader.trim());
      params.set('limit', '100');
      const res = await authGet(`/api/files/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items ?? []);
        setSearchTotal(data.total ?? 0);
        setSearchOpen(true);
      }
    } finally {
      setSearchLoading(false);
    }
  }, [searchFileName, searchUploader]);

  // AEO 单章节 AI 检测
  const handleAeoDetect = useCallback(async () => {
    setAeoDetecting(true);
    setAeoDetectResult(null);
    try {
      const res = await fetch(`/api/aeo/plugins/${activeItem}/run`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAeoDetectResult({ result: 'fail', detail: err.detail ?? '触发检测失败，请重试。' });
        setAeoDetectResultOpen(true);
        return;
      }
      const { task_id } = await res.json();
      // 轮询任务结果
      const poll = async () => {
        const r = await fetch(`/api/aeo/plugins/tasks/${task_id}`, { headers: getAuthHeaders() });
        if (!r.ok) { setAeoDetectResult({ result: 'fail', detail: '轮询任务状态失败。' }); setAeoDetectResultOpen(true); setAeoDetecting(false); return; }
        const data = await r.json();
        if (data.status === 'pending' || data.status === 'running') {
          setTimeout(poll, 2000);
          return;
        }
        setAeoDetecting(false);
        if (data.status === 'success') {
          setAeoDetectResult(data.result);
        } else {
          setAeoDetectResult({ result: 'fail', detail: data.detail ?? '任务执行失败。' });
        }
        setAeoDetectResultOpen(true);
      };
      setTimeout(poll, 1500);
    } catch {
      setAeoDetecting(false);
      setAeoDetectResult({ result: 'fail', detail: '网络错误，请重试。' });
      setAeoDetectResultOpen(true);
    }
  }, [activeItem]);

  // AEO 插件上传
  const handleAeoPluginUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAeoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/aeo/plugins/${activeItem}/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(data.message ?? '插件上传成功');
      } else {
        alert(data.detail ?? '插件上传失败，请重试。');
      }
    } catch {
      alert('网络错误，插件上传失败。');
    } finally {
      setAeoUploading(false);
      if (aeoUploadInputRef.current) aeoUploadInputRef.current.value = '';
    }
  }, [activeItem]);

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const handleKnowledgeBaseClick = (id: number, name: string) => {
    setSelectedKnowledgeBase({ id, name });
  };

  const handleBackToHome = () => {
    setSelectedKnowledgeBase(null);
  };

  const handleSidebarItemClick = (itemId: string) => {
    setActiveItem(itemId);
    if (itemId === 'home' || itemId.startsWith('aeo_')) {
      setSelectedKnowledgeBase(null);
    }
  };

  const renderMainContent = () => {
    if (activeItem === 'department') {
      return <DepartmentManagement />;
    }

    if (activeItem === 'user') {
      return <UserManagement />;
    }

    if (activeItem === 'role') {
      return <RoleManagement />;
    }

    if (activeItem === 'recent') {
      return <RecentAccess />;
    }

    if (activeItem === 'favorites') {
      return <MyFavorites />;
    }

    if (activeItem === 'likes') {
      return <MyLikes />;
    }

    if (activeItem === 'comments') {
      return <MyComments />;
    }

    if (activeItem === 'uploads') {
      return <MyUploads />;
    }

    if (activeItem === 'ai') {
      return <MyAIConversations />;
    }

    if (activeItem === 'settings') {
      return <SystemSettings onLogoChange={setSystemLogo} onNameChange={setSystemName} />;
    }

    if (activeItem === 'openplatform') {
      return <OpenPlatform />;
    }

    if (activeItem === 'aeo_home') {
      return <AEOHomePage />;
    }

    if (selectedKnowledgeBase) {
      const currentKbData = knowledgeBases.find(kb => kb.id === selectedKnowledgeBase.id);
      return (
        <>
          <KnowledgeBaseDetail
            kbId={selectedKnowledgeBase.id}
            knowledgeBaseName={selectedKnowledgeBase.name}
            onBack={handleBackToHome}
            onStatsChange={() => loadHomeData(currentDirTag)}
            onPermClick={() => detailCardRef.current?.openPerm()}
            onEditClick={() => detailCardRef.current?.openEdit()}
          />
          {currentKbData && (
            <div style={{ display: 'none' }}>
              <KnowledgeBaseCard
                ref={detailCardRef}
                id={currentKbData.id}
                title={currentKbData.name}
                fileCount={currentKbData.file_count}
                storage={''}
                description={currentKbData.description}
                deptId={currentKbData.dept_id}
                deptManagerUserId={currentKbData.dept_manager_user_id}
                createdBy={currentKbData.created_by}
                currentUserId={currentUserId}
                isCurrentUserSuperAdmin={isCurrentUserSuperAdmin}
                sortOrder={currentKbData.sort_order}
                onUpdated={() => loadHomeData(currentDirTag)}
              />
            </div>
          )}
        </>
      );
    }

    return (
      <>
        {/* Top Bar */}
        <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center justify-between px-8">
          <div className="flex items-center gap-2">
            <HomeIcon className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
            <h1 className="text-[21px] font-semibold text-[#1d1d1f]">{PAGE_TITLES[activeItem] ?? '知识库首页'}</h1>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-[#86868b]">
            <span>知识库: <span className="font-semibold text-[#1d1d1f]">{globalStats.kb_count}</span>个</span>
            <span className="w-px h-4 bg-[#d2d2d7]"></span>
            <span>文件数: <span className="font-semibold text-[#1d1d1f]">{globalStats.file_count}</span>个</span>
            <span className="w-px h-4 bg-[#d2d2d7]"></span>
            <span>占用空间: <span className="font-semibold text-[#1d1d1f]">{formatSize(globalStats.total_size)}</span></span>
          </div>
        </div>

        {/* Search and Actions Bar */}
        <div className="bg-[#fbfbfd] border-b border-[#d2d2d7]/50 px-8 py-4">
          <div className="flex items-center gap-4">
            {/* File Name Filter */}
            <div className="flex items-center gap-2">
              <label className="text-[14px] text-[#86868b] whitespace-nowrap">文件名:</label>
              <div className="relative group">
                <input
                  type="text"
                  value={searchFileName}
                  onChange={e => setSearchFileName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearchFiles(); }}
                  placeholder=""
                  className="w-56 px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] pr-7"
                />
                {searchFileName && (
                  <button
                    onClick={() => setSearchFileName('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[#86868b] hover:text-[#1d1d1f]"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            {/* Search Button */}
            <button
              onClick={handleSearchFiles}
              disabled={searchLoading}
              className="px-4 py-1.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] hover:border-[#86868b] disabled:opacity-60 transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-[#1d1d1f]"
            >
              <Search className="w-[16px] h-[16px]" strokeWidth={1.5} />
              {searchLoading ? '搜索中...' : '搜索文件'}
            </button>

            <div className="flex-1"></div>

            {/* New Knowledge Base Button */}
            <button
              onClick={() => setNewKnowledgeBaseDialogOpen(true)}
              className="px-5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] rounded-lg transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-white"
            >
              <Plus className="w-[16px] h-[16px]" strokeWidth={2} />
              新建知识库
            </button>

            {/* AEO section buttons */}
            {activeItem.startsWith('aeo_') && activeItem !== 'aeo_home' && (
              <>
                <button
                  onClick={handleAeoDetect}
                  disabled={aeoDetecting}
                  className="px-4 py-1.5 bg-[#34c759] hover:bg-[#2eb350] disabled:opacity-60 rounded-lg transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-white"
                >
                  <BotMessageSquare className="w-[16px] h-[16px]" strokeWidth={2} />
                  {aeoDetecting ? '检测中...' : 'AI检测'}
                </button>
                <button
                  onClick={() => aeoUploadInputRef.current?.click()}
                  disabled={aeoUploading}
                  className="px-4 py-1.5 bg-white hover:bg-[#f5f5f7] disabled:opacity-60 rounded-lg border border-[#d2d2d7] transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-[#1d1d1f]"
                >
                  <Upload className="w-[16px] h-[16px]" strokeWidth={2} />
                  {aeoUploading ? '上传中...' : '上传插件'}
                </button>
                <input
                  ref={aeoUploadInputRef}
                  type="file"
                  accept=".py"
                  className="hidden"
                  onChange={handleAeoPluginUpload}
                />
              </>
            )}
          </div>
        </div>

        {/* Knowledge Bases Grid */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-8">
            {knowledgeBases.map((kb) => (
              <KnowledgeBaseCard
                key={kb.id}
                id={kb.id}
                title={kb.name}
                fileCount={kb.file_count}
                storage={formatSize(kb.total_size)}
                description={kb.description}
                deptId={kb.dept_id}
                deptManagerUserId={kb.dept_manager_user_id}
                createdBy={kb.created_by}
                currentUserId={currentUserId}
                isCurrentUserSuperAdmin={isCurrentUserSuperAdmin}
                sortOrder={kb.sort_order}
                onClick={() => handleKnowledgeBaseClick(kb.id, kb.name)}
                onDeleted={() => loadHomeData(currentDirTag)}
                onUpdated={() => loadHomeData(currentDirTag)}
              />
            ))}
            {knowledgeBases.length === 0 && <NewKnowledgeBaseCard onClick={() => setNewKnowledgeBaseDialogOpen(true)} />}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="size-full flex bg-[#f5f5f7]">
      {/* Sidebar */}
      <Sidebar
        activeItem={activeItem}
        onItemClick={handleSidebarItemClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={handleLogout}
        systemLogo={systemLogo}
        systemName={systemName}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {renderMainContent()}
      </div>

      {/* New Knowledge Base Dialog */}
      <NewKnowledgeBaseDialog
        open={newKnowledgeBaseDialogOpen}
        onOpenChange={setNewKnowledgeBaseDialogOpen}
        onCreated={() => loadHomeData(currentDirTag)}
        dirTag={currentDirTag === GENERAL_TAG ? null : currentDirTag}
      />

      {/* AEO AI检测 结果弹窗 */}
      <Dialog.Root open={aeoDetectResultOpen} onOpenChange={setAeoDetectResultOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-md z-50 p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">AI 检测结果</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
            {aeoDetectResult && (
              <div className={`flex flex-col items-center gap-3 py-4 rounded-xl ${aeoDetectResult.result === 'pass' ? 'bg-[#34c759]/10' : 'bg-[#ff3b30]/10'}`}>
                <span className={`text-[28px] font-bold ${aeoDetectResult.result === 'pass' ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                  {aeoDetectResult.result === 'pass' ? '达标' : '不达标'}
                </span>
                {aeoDetectResult.detail && (
                  <p className="text-[13px] text-[#3c3c43] text-center px-4 leading-relaxed">{aeoDetectResult.detail}</p>
                )}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* File Search Results Dialog */}
      <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-2xl z-50 flex flex-col max-h-[75vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#d2d2d7]/60 flex-shrink-0">
              <div>
                <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">搜索结果</Dialog.Title>
                <p className="text-[13px] text-[#86868b] mt-0.5">
                  共找到 <span className="font-medium text-[#1d1d1f]">{searchTotal}</span> 个文件
                  {searchTotal > 100 && '（最多显示 100 条）'}
                </p>
              </div>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#86868b]">
                  <Search className="w-10 h-10 mb-3 opacity-30" strokeWidth={1} />
                  <p className="text-[14px]">未找到符合条件的文件</p>
                </div>
              ) : (
                <div className="divide-y divide-[#d2d2d7]/40">
                  {searchResults.map(f => (
                    <div
                      key={f.id}
                      onClick={() => { setSearchOpen(false); window.open(`/#preview/${f.id}`, '_blank'); }}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#f5f5f7] cursor-pointer transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-[#0071e3]" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[#1d1d1f] truncate">{f.name}</p>
                        <p className="text-[12px] text-[#86868b] mt-0.5 truncate">
                          {f.kb_name ?? '—'}
                          {f.uploader_name && <span className="ml-2">· 上传人：{f.uploader_name}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-[12px] text-[#86868b]">{formatSize(f.file_size)}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          f.process_status === 'completed' ? 'bg-[#34c759]/10 text-[#34c759]' :
                          f.process_status === 'failed'    ? 'bg-red-50 text-red-500' :
                          'bg-[#0071e3]/10 text-[#0071e3]'
                        }`}>
                          {f.process_status === 'completed' ? '已完成' :
                           f.process_status === 'failed'    ? '处理失败' : '处理中'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}