import { useState, useEffect } from 'react';
import {
  Home,
  Clock,
  Star,
  ThumbsUp,
  MessageSquare,
  Upload,
  MessageCircle,
  Settings,
  KeyRound,
  UserCircle,
  LogOut,
  Building2,
  Users,
  Shield,
  Cog,
  Globe,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Info,
  ArrowLeftRight,
  ClipboardCheck,
  Banknote,
  MapPin,
  UserCheck,
  Package,
  Truck,
  Handshake,
  GraduationCap,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { ChangeAvatarDialog } from './ChangeAvatarDialog';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout?: () => void;
  systemLogo?: string | null;
  systemName?: string;
}

interface UserInfo {
  id: number;
  username: string;
  real_name: string;
  avatar: string | null;
  is_super_admin: boolean;
  menu_permissions: string[];
}

export function Sidebar({ activeItem, onItemClick, collapsed, onToggleCollapse, onLogout, systemLogo, systemName = 'icanfly' }: SidebarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'kb' | 'aeo'>('kb');
  const showAeo = import.meta.env.VITE_SHOW_AEO === '1';

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUserInfo(data); })
      .catch(() => {});
  }, []);

  // Returns true if the current user can see this system menu item
  const canSee = (permKey: string) => {
    if (!userInfo) return false;
    if (userInfo.is_super_admin) return true;
    return userInfo.menu_permissions.includes(permKey);
  };

  const handleAvatarSuccess = (avatarUrl: string) => {
    setUserInfo(prev => prev ? { ...prev, avatar: avatarUrl } : prev);
  };

  const menuItems = [
    { id: 'home', label: '知识库首页', icon: Home },
    { id: 'recent', label: '最近访问', icon: Clock },
    { id: 'favorites', label: '我的收藏', icon: Star },
    { id: 'likes', label: '我的点赞', icon: ThumbsUp },
    { id: 'comments', label: '我的评论', icon: MessageSquare },
    { id: 'uploads', label: '我上传的文件', icon: Upload },
    { id: 'ai', label: '我的AI会话', icon: MessageCircle },
  ];

  const aeoMenuItems = [
    { id: 'aeo_home',     label: 'AEO首页',   icon: LayoutDashboard },
    { id: 'aeo_basic',    label: '基本信息',   icon: Info },
    { id: 'aeo_trade',    label: '进出口',     icon: ArrowLeftRight },
    { id: 'aeo_audit',    label: '内审及整改', icon: ClipboardCheck },
    { id: 'aeo_finance',  label: '财务',       icon: Banknote },
    { id: 'aeo_location', label: '场所',       icon: MapPin },
    { id: 'aeo_hr',       label: '人事',       icon: UserCheck },
    { id: 'aeo_cargo',    label: '货物收发',   icon: Package },
    { id: 'aeo_vehicle',  label: '运输工具',   icon: Truck },
    { id: 'aeo_partner',  label: '商业伙伴',   icon: Handshake },
    { id: 'aeo_training', label: '培训',       icon: GraduationCap },
  ];

  if (collapsed) {
    return (
      <div className="w-16 h-full bg-[#fbfbfd] border-r border-[#d2d2d7] flex flex-col items-center">
        {/* Collapsed Logo */}
        <div className="h-14 border-b border-[#d2d2d7]/50 w-full flex justify-center items-center">
          {systemLogo ? (
            <button
              onClick={onToggleCollapse}
              className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-[#0071e3]/30 transition-all p-0.5"
              title="展开菜单"
            >
              <img src={systemLogo} alt="logo" className="w-full h-full object-contain" />
            </button>
          ) : (
            <button
              onClick={onToggleCollapse}
              className="w-9 h-9 rounded-xl bg-[#1d1d1f] flex items-center justify-center hover:bg-[#2d2d2f] transition-colors"
              title="展开菜单"
            >
              <PanelLeftOpen className="w-5 h-5 text-white" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Collapsed Menu Items */}
        <nav className="px-2 py-4 w-full">
          {(activeTab === 'kb' ? menuItems : aeoMenuItems).map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onItemClick(item.id)}
                className={`
                  w-full flex items-center justify-center p-3 rounded-lg mb-1
                  transition-all duration-150 ease-out
                  ${isActive
                    ? 'bg-[#0071e3] text-white'
                    : 'text-[#1d1d1f] hover:bg-[#0071e3]/20'
                  }
                `}
                title={item.label}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
              </button>
            );
          })}
        </nav>

        {/* Spacer to push user profile to bottom */}
        <div className="flex-1"></div>

        {/* Collapsed User Profile */}
        <div className="p-3 border-t border-[#d2d2d7]/50 w-full flex flex-col items-center gap-2">
          {/* User Menu */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="w-8 h-8 rounded-full overflow-hidden bg-[#1d1d1f] flex items-center justify-center hover:ring-2 hover:ring-[#0071e3]/20 transition-all" title={userInfo?.real_name ?? ''}>
                {userInfo?.avatar
                  ? <img src={userInfo.avatar} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-white text-[13px] font-medium">{(userInfo?.real_name ?? userInfo?.username ?? '?')[0]}</span>
                }
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] bg-white rounded-xl border border-[#d2d2d7] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-1 z-50"
                sideOffset={5}
                side="right"
              >
                <DropdownMenu.Item
                  className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                  onClick={() => setPasswordDialogOpen(true)}
                >
                  <KeyRound className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  修改密码
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                  onClick={() => setAvatarDialogOpen(true)}
                >
                  <UserCircle className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  修改头像
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-[#d2d2d7] my-1" />
                <DropdownMenu.Item
                  className="flex items-center gap-3 px-3 py-2 text-[13px] text-red-500 rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                  onClick={onLogout}
                >
                  <LogOut className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  退出系统
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* System Settings Menu */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="p-2 rounded-lg border border-[#d2d2d7] hover:bg-[#0071e3]/15 hover:border-[#0071e3]/30 transition-colors"
                title="系统设置"
              >
                <Settings className="w-[16px] h-[16px] text-[#86868b]" strokeWidth={1.5} />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] bg-white rounded-xl border border-[#d2d2d7] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-1 z-50"
                sideOffset={5}
                side="right"
              >
                {canSee('dept') && (
                  <DropdownMenu.Item
                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                    onClick={() => onItemClick('department')}
                  >
                    <Building2 className="w-[16px] h-[16px]" strokeWidth={1.5} />
                    部门管理
                  </DropdownMenu.Item>
                )}
                {canSee('user') && (
                  <DropdownMenu.Item
                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                    onClick={() => onItemClick('user')}
                  >
                    <Users className="w-[16px] h-[16px]" strokeWidth={1.5} />
                    用户管理
                  </DropdownMenu.Item>
                )}
                {canSee('role') && (
                  <DropdownMenu.Item
                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                    onClick={() => onItemClick('role')}
                  >
                    <Shield className="w-[16px] h-[16px]" strokeWidth={1.5} />
                    角色管理
                  </DropdownMenu.Item>
                )}
                {canSee('settings') && (
                  <DropdownMenu.Item
                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                    onClick={() => onItemClick('settings')}
                  >
                    <Cog className="w-[16px] h-[16px]" strokeWidth={1.5} />
                    系统设置
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                  onClick={() => onItemClick('openplatform')}
                >
                  <Globe className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  开放平台
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 h-full bg-[#fbfbfd] border-r border-[#d2d2d7] flex flex-col">
      {/* Logo */}
      <div className="h-14 px-4 border-b border-[#d2d2d7]/50 flex items-center">
        <div className="flex items-center gap-2.5">
          {/* Logo image or default icon */}
          {systemLogo ? (
            <img src={systemLogo} alt="logo" className="h-9 w-auto object-contain flex-shrink-0" style={{ maxWidth: '100px' }} />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-[#1d1d1f] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 120 120" className="w-5 h-5">
                <path
                  d="M20 30 L40 20 L40 80 L20 90 Z M50 15 L70 5 L70 95 L50 105 Z M80 20 L100 10 L100 70 L80 80 Z"
                  fill="currentColor"
                  className="text-white"
                />
              </svg>
            </div>
          )}
          {/* System name */}
          <span className="font-semibold text-[17px] tracking-tight text-[#1d1d1f] flex-1 truncate">{systemName}</span>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-[#e8e8ed] transition-colors flex-shrink-0"
            title="折叠菜单"
          >
            <PanelLeftClose className="w-[16px] h-[16px] text-[#86868b]" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Tab 切换（仅 showAeo 时显示） */}
      {showAeo && (
        <div className="px-3 pt-2 pb-0 flex border-b border-[#d2d2d7]/50">
          <button
            onClick={() => setActiveTab('kb')}
            className={`flex-1 py-1.5 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'kb'
                ? 'text-[#0071e3] border-[#0071e3]'
                : 'text-[#86868b] border-transparent hover:text-[#1d1d1f]'
            }`}
          >
            知识库
          </button>
          <button
            onClick={() => setActiveTab('aeo')}
            className={`flex-1 py-1.5 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'aeo'
                ? 'text-[#0071e3] border-[#0071e3]'
                : 'text-[#86868b] border-transparent hover:text-[#1d1d1f]'
            }`}
          >
            AEO认证
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="px-3 py-4">
        {(activeTab === 'kb' ? menuItems : aeoMenuItems).map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5
                transition-all duration-150 ease-out
                ${isActive
                  ? 'bg-[#0071e3] text-white'
                  : 'text-[#1d1d1f] hover:bg-[#0071e3]/20'
                }
              `}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
              <span className="text-[14px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Spacer to push user profile to bottom */}
      <div className="flex-1"></div>

      {/* User Profile */}
      <div className="p-4 border-t border-[#d2d2d7]/50">
        <div className="flex items-center gap-0">
          {/* User Info with Dropdown */}
          <DropdownMenu.Root open={userMenuOpen} onOpenChange={setUserMenuOpen}>
            <DropdownMenu.Trigger asChild>
              <button className="flex-1 flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#0071e3]/15 transition-colors">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-[#1d1d1f] flex items-center justify-center flex-shrink-0">
                  {userInfo?.avatar
                    ? <img src={userInfo.avatar} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-white text-[13px] font-medium">{(userInfo?.real_name ?? userInfo?.username ?? '?')[0]}</span>
                  }
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[13px] font-medium text-[#1d1d1f]">{userInfo?.real_name ?? userInfo?.username ?? '...'}</div>
                  <div className="text-[12px] text-[#86868b]">@{userInfo?.username ?? ''}</div>
                </div>
                {userMenuOpen ? (
                  <ChevronDown className="w-[14px] h-[14px] text-[#86868b] transition-transform" strokeWidth={1.5} />
                ) : (
                  <ChevronUp className="w-[14px] h-[14px] text-[#86868b] transition-transform" strokeWidth={1.5} />
                )}
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] bg-white rounded-xl border border-[#d2d2d7] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-1 z-50"
                sideOffset={5}
                align="end"
              >
                <DropdownMenu.Item
                  className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                  onClick={() => setPasswordDialogOpen(true)}
                >
                  <KeyRound className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  修改密码
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                  onClick={() => setAvatarDialogOpen(true)}
                >
                  <UserCircle className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  修改头像
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-[#d2d2d7] my-1" />
                <DropdownMenu.Item
                  className="flex items-center gap-3 px-3 py-2 text-[13px] text-red-500 rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                  onClick={onLogout}
                >
                  <LogOut className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  退出系统
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* System Settings Dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-2.5 rounded-lg border border-[#d2d2d7] hover:bg-[#0071e3]/15 hover:border-[#0071e3]/30 transition-colors">
                <Settings className="w-[18px] h-[18px] text-[#86868b]" strokeWidth={1.5} />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] bg-white rounded-xl border border-[#d2d2d7] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-1 z-50"
                sideOffset={5}
                align="end"
              >
                {canSee('dept') && (
                  <DropdownMenu.Item
                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                    onClick={() => onItemClick('department')}
                  >
                    <Building2 className="w-[16px] h-[16px]" strokeWidth={1.5} />
                    部门管理
                  </DropdownMenu.Item>
                )}
                {canSee('user') && (
                  <DropdownMenu.Item
                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                    onClick={() => onItemClick('user')}
                  >
                    <Users className="w-[16px] h-[16px]" strokeWidth={1.5} />
                    用户管理
                  </DropdownMenu.Item>
                )}
                {canSee('role') && (
                  <DropdownMenu.Item
                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                    onClick={() => onItemClick('role')}
                  >
                    <Shield className="w-[16px] h-[16px]" strokeWidth={1.5} />
                    角色管理
                  </DropdownMenu.Item>
                )}
                {canSee('settings') && (
                  <DropdownMenu.Item
                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                    onClick={() => onItemClick('settings')}
                  >
                    <Cog className="w-[16px] h-[16px]" strokeWidth={1.5} />
                    系统设置
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#1d1d1f] rounded-lg hover:bg-[#0071e3]/20 outline-none cursor-pointer transition-colors"
                  onClick={() => onItemClick('openplatform')}
                >
                  <Globe className="w-[16px] h-[16px]" strokeWidth={1.5} />
                  开放平台
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Dialogs */}
      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
      <ChangeAvatarDialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen} onSuccess={handleAvatarSuccess} />
    </div>
  );
}
