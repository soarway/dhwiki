import { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { MoreVertical, FolderOpen, Settings, Shield, Trash2, X, Check, Search, ChevronDown, Building2, Users } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';

type KbType = 'single' | 'multi' | 'users' | 'private';

const KB_TYPE_OPTIONS: { value: KbType; label: string; hint: string }[] = [
  { value: 'single',  label: '单部门知识库',    hint: '仅指定部门及其下级部门可查看' },
  { value: 'multi',   label: '多部门知识库',    hint: '多个部门均可查看' },
  { value: 'users',   label: '跨部门多人知识库', hint: '指定成员可查看，创建人拥有删除权限' },
  { value: 'private', label: '私有知识库',      hint: '仅创建人本人可查看' },
];

interface DeptNode {
  id: number;
  name: string;
  parent_id: number | null;
  children: DeptNode[];
}

interface UserOption {
  id: number;
  username: string;
  real_name: string;
  dept_names: string[];
  dept_ids: number[];
  status: boolean;
}

interface GrantedUser {
  perm_id: number;
  user_id: number;
  username: string;
  real_name: string;
  permission: string;
}

interface KnowledgeBaseCardProps {
  id: number;
  title: string;
  fileCount: number;
  storage: string;
  description?: string | null;
  deptId?: number | null;
  deptManagerUserId?: number | null;
  createdBy?: number | null;
  currentUserId?: number | null;
  isCurrentUserSuperAdmin?: boolean;
  icon?: string;
  onClick?: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
  sortOrder?: number | null;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function flattenTree(nodes: DeptNode[], depth = 0): { node: DeptNode; depth: number }[] {
  const result: { node: DeptNode; depth: number }[] = [];
  for (const n of nodes) {
    result.push({ node: n, depth });
    result.push(...flattenTree(n.children, depth + 1));
  }
  return result;
}

export interface KnowledgeBaseCardHandle {
  openPerm: () => void;
  openEdit: () => void;
}

export const KnowledgeBaseCard = forwardRef<KnowledgeBaseCardHandle, KnowledgeBaseCardProps>(function KnowledgeBaseCard({
  id, title, fileCount, storage, description, deptId, deptManagerUserId,
  createdBy, currentUserId, isCurrentUserSuperAdmin, onClick, onDeleted, onUpdated, sortOrder,
}: KnowledgeBaseCardProps, ref) {
  // ── Delete dialog ──────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // ── Edit dialog ────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editDeptName, setEditDeptName] = useState('全公司（所有人可见）');
  const [editDeptTree, setEditDeptTree] = useState<DeptNode[]>([]);
  const [showEditDeptPicker, setShowEditDeptPicker] = useState(false);
  const [editSortOrder, setEditSortOrder] = useState<number | ''>('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // ── Permission dialog ──────────────────────────────────────────
  const [permOpen, setPermOpen] = useState(false);
  const [deptTree, setDeptTree] = useState<DeptNode[]>([]);
  const [filterDeptId, setFilterDeptId] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [checkedUserIds, setCheckedUserIds] = useState<Set<number>>(new Set());
  const [userSearch, setUserSearch] = useState('');
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState('');
  const [liveDeptManagerUserId, setLiveDeptManagerUserId] = useState<number | null | undefined>(deptManagerUserId);
  const [liveDeptId, setLiveDeptId] = useState<number | null | undefined>(deptId);
  // KB type selection in perm dialog
  const [permKbType, setPermKbType] = useState<KbType>('single');
  const [showPermTypePicker, setShowPermTypePicker] = useState(false);
  const [permDeptId, setPermDeptId] = useState<number | null>(null);
  const [permDeptName, setPermDeptName] = useState('');
  const [permDeptIds, setPermDeptIds] = useState<Set<number>>(new Set());
  const [permDeptNameMap, setPermDeptNameMap] = useState<Map<number, string>>(new Map());
  const [showPermDeptPicker, setShowPermDeptPicker] = useState(false);

  const canShowMenu = isCurrentUserSuperAdmin ||
    (deptManagerUserId != null && deptManagerUserId === currentUserId) ||
    (deptId == null && createdBy != null && createdBy === currentUserId);

  const canDelete = fileCount < 5 && (
    isCurrentUserSuperAdmin ||
    (deptId == null && createdBy != null && createdBy === currentUserId)
  );

  // ── Handlers ───────────────────────────────────────────────────

  const handleOpenEdit = () => {
    setEditName(title);
    setEditDesc(description || '');
    setEditDeptId(deptId ?? null);
    setEditSortOrder(sortOrder ?? '');
    setEditError('');
    setShowEditDeptPicker(false);
    fetch('/api/departments/tree', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((tree: DeptNode[]) => {
        setEditDeptTree(tree);
        if (deptId != null) {
          const flat = flattenTree(tree);
          const found = flat.find(f => f.node.id === deptId);
          setEditDeptName(found ? found.node.name : String(deptId));
        } else {
          setEditDeptName('全公司（所有人可见）');
        }
      })
      .catch(() => {});
    setEditOpen(true);
  };

  const handleOpenPerm = async () => {
    const [treeRes, usersRes, permsRes, kbRes] = await Promise.all([
      fetch('/api/departments/tree', { headers: authHeaders() }),
      fetch('/api/users/selectable', { headers: authHeaders() }),
      fetch(`/api/knowledge-bases/${id}/user-permissions`, { headers: authHeaders() }),
      fetch(`/api/knowledge-bases/${id}`, { headers: authHeaders() }),
    ]);

    let tree: DeptNode[] = [];
    if (treeRes.ok) {
      tree = await treeRes.json();
      setDeptTree(tree);
      const map = new Map<number, string>();
      const collect = (nodes: DeptNode[]) => { for (const n of nodes) { map.set(n.id, n.name); collect(n.children); } };
      collect(tree);
      setPermDeptNameMap(map);
    }

    if (usersRes.ok) { const d = await usersRes.json(); setAllUsers(d.items ?? []); }

    let userPerms: GrantedUser[] = [];
    if (permsRes.ok) {
      userPerms = await permsRes.json();
      const others = userPerms.filter(p => p.user_id !== createdBy);
      setCheckedUserIds(new Set(others.map(p => p.user_id)));
    } else {
      setCheckedUserIds(new Set());
    }

    if (kbRes.ok) {
      const kb = await kbRes.json();
      setLiveDeptManagerUserId(kb.dept_manager_user_id);
      const deptIdsArr: number[] = kb.dept_ids ?? [];
      setLiveDeptId(deptIdsArr[0] ?? null);

      if (deptIdsArr.length === 1) {
        setPermKbType('single');
        setPermDeptId(deptIdsArr[0]);
        setPermDeptIds(new Set());
        const flat = flattenTree(tree);
        setPermDeptName(flat.find(f => f.node.id === deptIdsArr[0])?.node.name ?? String(deptIdsArr[0]));
      } else if (deptIdsArr.length > 1) {
        setPermKbType('multi');
        setPermDeptId(null);
        setPermDeptName('');
        setPermDeptIds(new Set(deptIdsArr));
      } else {
        const others = userPerms.filter(p => p.user_id !== createdBy);
        setPermKbType(others.length > 0 ? 'users' : 'private');
        setPermDeptId(null);
        setPermDeptName('');
        setPermDeptIds(new Set());
      }
    }

    setFilterDeptId(null);
    setUserSearch('');
    setPermError('');
    setShowPermTypePicker(false);
    setShowPermDeptPicker(false);
    setPermOpen(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/knowledge-bases/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok || res.status === 204) {
        setDeleteOpen(false);
        onDeleted?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.detail || '删除失败');
      }
    } catch {
      setDeleteError('网络错误');
    } finally {
      setDeleting(false);
    }
  };

  const handleEditSave = async () => {
    if (!editName.trim()) { setEditError('请输入知识库名称'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/knowledge-bases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
          dept_id: editDeptId,
          sort_order: editSortOrder === '' ? null : editSortOrder,
        }),
      });
      if (res.ok) {
        setEditOpen(false);
        onUpdated?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setEditError(data.detail || '保存失败');
      }
    } catch {
      setEditError('网络错误');
    } finally {
      setEditSaving(false);
    }
  };

  const handlePermSave = async () => {
    if (permKbType === 'single' && !permDeptId) { setPermError('请选择所属部门'); return; }
    if (permKbType === 'multi' && permDeptIds.size === 0) { setPermError('请至少选择一个部门'); return; }
    if (permKbType === 'users' && checkedUserIds.size === 0) { setPermError('请至少选择一名成员'); return; }
    setPermSaving(true);
    setPermError('');
    try {
      const body = {
        kb_type: permKbType,
        dept_ids: permKbType === 'single' ? (permDeptId ? [permDeptId] : []) : Array.from(permDeptIds),
        user_ids: permKbType === 'users' ? Array.from(checkedUserIds) : [],
      };
      const res = await fetch(`/api/knowledge-bases/${id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (res.ok || res.status === 204) {
        setPermOpen(false);
        onUpdated?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setPermError(data.detail || '保存失败');
      }
    } catch {
      setPermError('网络错误');
    } finally {
      setPermSaving(false);
    }
  };

  const toggleUser = (uid: number) => {
    setCheckedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  useImperativeHandle(ref, () => ({
    openPerm: handleOpenPerm,
    openEdit: handleOpenEdit,
  }));

  const filteredUsers = useMemo(() => allUsers.filter(u => {
    if (filterDeptId !== null && !u.dept_ids.includes(filterDeptId)) return false;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      if (!u.real_name.toLowerCase().includes(q) && !u.username.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allUsers, filterDeptId, userSearch]);

  const flatEditDepts = flattenTree(editDeptTree);
  const flatDepts = flattenTree(deptTree);

  return (
    <>
      {/* ── Card ── */}
      <div
        onClick={onClick}
        className="group relative bg-white rounded-[18px] border border-[#d2d2d7] p-6 hover:shadow-[0_8px_30px_rgba(0,113,227,0.12)] hover:border-[#0071e3]/40 hover:-translate-y-1 transition-all duration-300 ease-out cursor-pointer"
      >
        {/* More options button — only for super admin or dept manager */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              onClick={e => e.stopPropagation()}
              className={`absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#f5f5f7] hover:scale-110 transition-all duration-200 ${canShowMenu ? 'opacity-0 group-hover:opacity-100' : 'hidden'}`}
            >
              <MoreVertical className="w-[18px] h-[18px] text-[#86868b]" strokeWidth={1.5} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[180px] bg-white rounded-xl border border-[#d2d2d7] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-1 z-50"
              sideOffset={5}
              onClick={e => e.stopPropagation()}
            >
              <DropdownMenu.Item
                onSelect={e => { e.preventDefault(); handleOpenPerm(); }}
                className="flex items-center gap-3 px-3 py-2.5 text-[14px] text-[#1d1d1f] rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors"
              >
                <Shield className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                权限设置
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={e => { e.preventDefault(); handleOpenEdit(); }}
                className="flex items-center gap-3 px-3 py-2.5 text-[14px] text-[#1d1d1f] rounded-lg hover:bg-[#f5f5f7] outline-none cursor-pointer transition-colors"
              >
                <Settings className="w-4 h-4 text-[#0071e3]" strokeWidth={1.5} />
                基础信息设置
              </DropdownMenu.Item>
              {canDelete && (
                <>
                  <DropdownMenu.Separator className="my-1 h-px bg-[#d2d2d7]/60" />
                  <DropdownMenu.Item
                    onSelect={e => { e.preventDefault(); setDeleteError(''); setDeleteOpen(true); }}
                    className="flex items-center gap-3 px-3 py-2.5 text-[14px] text-red-500 rounded-lg hover:bg-red-50 outline-none cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    删除知识库
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Icon + description tooltip */}
        <div className="relative group/icon mb-5 w-12">
          <div className="w-12 h-12 rounded-xl bg-[#0071e3] flex items-center justify-center group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-[#0071e3]/30 transition-all duration-300">
            <FolderOpen className="w-6 h-6 text-white" strokeWidth={1.5} />
          </div>
          {description && (
            <div className="absolute left-0 top-14 z-20 w-56 bg-[#1d1d1f]/90 backdrop-blur-sm text-white text-[12px] leading-relaxed rounded-xl px-3 py-2.5 shadow-xl opacity-0 group-hover/icon:opacity-100 transition-opacity duration-200 pointer-events-none">
              <div className="absolute -top-1.5 left-4 w-3 h-3 bg-[#1d1d1f]/90 rotate-45 rounded-sm" />
              {description}
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="text-[17px] font-semibold mb-8 text-[#1d1d1f] leading-tight">{title}</h3>

        {/* Stats */}
        <div className="space-y-1 text-[14px]">
          <div className="text-[#86868b]">
            文件总数：<span className="text-[#1d1d1f] font-medium">{fileCount}个</span>
          </div>
          <div className="text-[#86868b]">
            占用空间：<span className="text-[#1d1d1f] font-medium">{storage}</span>
          </div>
        </div>
      </div>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog.Root open={deleteOpen} onOpenChange={o => { if (!deleting) setDeleteOpen(o); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-6 w-full max-w-md z-50"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">删除知识库</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
            <p className="text-[14px] text-[#1d1d1f] mb-1">
              确定要删除知识库 <span className="font-semibold">「{title}」</span> 吗？
            </p>
            <p className="text-[13px] text-[#86868b] mb-5">删除后该知识库及其所有文件将无法恢复。</p>
            {deleteError && (
              <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg text-[14px] font-medium transition-all">
                  取消
                </button>
              </Dialog.Close>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-[14px] font-medium transition-all"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Edit (基础信息) Dialog ── */}
      <Dialog.Root open={editOpen} onOpenChange={o => { if (!editSaving) setEditOpen(o); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-6 w-full max-w-lg z-50"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">基础信息设置</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-5">
              {editError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[14px] text-red-600">
                  {editError}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">知识库名称:</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="请输入知识库名称"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">知识库简介:</label>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="请输入知识库简介（选填）"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] resize-none"
                  rows={3}
                />
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">顺序号:</label>
                <input
                  type="number"
                  value={editSortOrder}
                  onChange={e => setEditSortOrder(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="请输入顺序号（选填，留空则排在末尾）"
                  min={1}
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg text-[14px] font-medium transition-all">
                    取消
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-[14px] font-medium transition-all"
                >
                  {editSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Permission Dialog ── */}
      <Dialog.Root open={permOpen} onOpenChange={o => { if (!permSaving) setPermOpen(o); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content
            aria-describedby={undefined}
            className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full z-50 flex flex-col max-h-[85vh] ${permKbType === 'users' ? 'max-w-3xl' : 'max-w-lg'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#d2d2d7]/60 flex-shrink-0">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">权限设置 — {title}</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>

            {/* KB Type selector */}
            <div className="px-6 py-4 border-b border-[#d2d2d7]/60 flex-shrink-0">
              <label className="block text-[13px] font-medium text-[#86868b] mb-2">知识库类型</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPermTypePicker(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-[#d2d2d7] rounded-lg text-[14px] text-[#1d1d1f] hover:border-[#0071e3] transition-colors"
                >
                  <span>{KB_TYPE_OPTIONS.find(o => o.value === permKbType)?.label}</span>
                  <ChevronDown className={`w-4 h-4 text-[#86868b] transition-transform ${showPermTypePicker ? 'rotate-180' : ''}`} strokeWidth={1.5} />
                </button>
                {showPermTypePicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#d2d2d7] rounded-xl shadow-lg z-10 overflow-hidden">
                    {KB_TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setPermKbType(opt.value);
                          setShowPermTypePicker(false);
                          setShowPermDeptPicker(false);
                          setPermDeptId(null); setPermDeptName('');
                          setPermDeptIds(new Set());
                          setCheckedUserIds(new Set());
                          setFilterDeptId(null); setUserSearch('');
                          setPermError('');
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#f5f5f7] transition-colors text-left"
                      >
                        <div>
                          <p className="text-[14px] text-[#1d1d1f]">{opt.label}</p>
                          <p className="text-[12px] text-[#86868b]">{opt.hint}</p>
                        </div>
                        {permKbType === opt.value && <Check className="w-4 h-4 text-[#0071e3] flex-shrink-0" strokeWidth={2} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[12px] text-[#86868b] mt-1.5">
                {KB_TYPE_OPTIONS.find(o => o.value === permKbType)?.hint}
              </p>
            </div>

            {/* Type-specific body */}
            <div className={`flex-1 overflow-hidden flex flex-col ${permKbType !== 'users' ? 'px-6 py-4' : ''}`}>

              {/* 单部门 */}
              {permKbType === 'single' && (
                <div>
                  <label className="block text-[13px] font-medium text-[#86868b] mb-2">所属部门</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-[#86868b] flex-shrink-0" strokeWidth={1.5} />
                      <span className={`truncate ${!permDeptId ? 'text-[#86868b]' : 'text-[#1d1d1f]'}`}>
                        {permDeptId ? permDeptName : '请选择部门'}
                      </span>
                    </div>
                    <button type="button" onClick={() => setShowPermDeptPicker(v => !v)}
                      className="px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[14px] font-medium transition-all flex-shrink-0">
                      选择
                    </button>
                  </div>
                  {showPermDeptPicker && (
                    <div className="mt-2 bg-white border border-[#d2d2d7] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {flatDepts.map(({ node, depth }) => (
                        <button key={node.id} type="button"
                          onClick={() => { setPermDeptId(node.id); setPermDeptName(node.name); setShowPermDeptPicker(false); }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#f5f5f7] transition-colors text-left"
                          style={{ paddingLeft: `${16 + depth * 20}px` }}>
                          <span className="text-[14px] text-[#1d1d1f]">{node.name}</span>
                          {permDeptId === node.id && <Check className="w-4 h-4 text-[#0071e3]" strokeWidth={2} />}
                        </button>
                      ))}
                      {flatDepts.length === 0 && <p className="px-4 py-3 text-[13px] text-[#86868b]">暂无部门数据</p>}
                    </div>
                  )}
                </div>
              )}

              {/* 多部门 */}
              {permKbType === 'multi' && (
                <div>
                  <label className="block text-[13px] font-medium text-[#86868b] mb-2">所属部门（可多选）</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-[#86868b] flex-shrink-0" strokeWidth={1.5} />
                      <span className={`truncate ${permDeptIds.size === 0 ? 'text-[#86868b]' : 'text-[#1d1d1f]'}`}>
                        {permDeptIds.size === 0 ? '请选择部门' : Array.from(permDeptIds).map(id => permDeptNameMap.get(id) ?? id).join('、')}
                      </span>
                    </div>
                    <button type="button" onClick={() => setShowPermDeptPicker(v => !v)}
                      className="px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[14px] font-medium transition-all flex-shrink-0">
                      选择
                    </button>
                  </div>
                  {showPermDeptPicker && (
                    <div className="mt-2 bg-white border border-[#d2d2d7] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {flatDepts.map(({ node, depth }) => {
                        const checked = permDeptIds.has(node.id);
                        return (
                          <button key={node.id} type="button"
                            onClick={() => setPermDeptIds(prev => { const n = new Set(prev); if (n.has(node.id)) n.delete(node.id); else n.add(node.id); return n; })}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#f5f5f7] transition-colors text-left"
                            style={{ paddingLeft: `${16 + depth * 20}px` }}>
                            <span className="text-[14px] text-[#1d1d1f]">{node.name}</span>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-[#0071e3] border-[#0071e3]' : 'border-[#d2d2d7]'}`}>
                              {checked && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                            </div>
                          </button>
                        );
                      })}
                      {flatDepts.length === 0 && <p className="px-4 py-3 text-[13px] text-[#86868b]">暂无部门数据</p>}
                    </div>
                  )}
                  <p className="text-[12px] text-[#0071e3] mt-1.5">已选 {permDeptIds.size} 个部门</p>
                </div>
              )}

              {/* 跨部门多人 — two-panel */}
              {permKbType === 'users' && (
                <div className="flex flex-1 overflow-hidden">
                  {/* Left: dept filter */}
                  <div className="w-48 flex-shrink-0 border-r border-[#d2d2d7]/60 overflow-y-auto py-2">
                    <button onClick={() => setFilterDeptId(null)}
                      className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${filterDeptId === null ? 'bg-[#0071e3]/10 text-[#0071e3] font-medium' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'}`}>
                      全部成员
                    </button>
                    {flatDepts.map(({ node, depth }) => (
                      <button key={node.id} onClick={() => setFilterDeptId(node.id)}
                        className={`w-full text-left px-4 py-2 text-[13px] transition-colors truncate ${filterDeptId === node.id ? 'bg-[#0071e3]/10 text-[#0071e3] font-medium' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'}`}
                        style={{ paddingLeft: `${16 + depth * 14}px` }}>
                        {node.name}
                      </button>
                    ))}
                  </div>
                  {/* Right: user list */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#d2d2d7]/40">
                      <div className="flex items-center gap-2 px-3 py-2 bg-[#f5f5f7] rounded-lg">
                        <Search className="w-4 h-4 text-[#86868b] flex-shrink-0" strokeWidth={1.5} />
                        <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                          placeholder="搜索用户姓名或账号"
                          className="flex-1 bg-transparent text-[13px] text-[#1d1d1f] outline-none placeholder:text-[#86868b]" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {filteredUsers.length === 0
                        ? <p className="px-4 py-6 text-[13px] text-[#86868b] text-center">暂无用户</p>
                        : filteredUsers.map(u => {
                          const checked = checkedUserIds.has(u.id);
                          return (
                            <div key={u.id} onClick={() => toggleUser(u.id)}
                              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-[#0071e3]/5' : 'hover:bg-[#f5f5f7]'}`}>
                              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-[#0071e3] border-[#0071e3]' : 'border-[#d2d2d7]'}`}>
                                {checked && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                              </div>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold text-white flex-shrink-0 ${u.status ? 'bg-[#0071e3]' : 'bg-[#86868b]'}`}>
                                {(u.real_name || u.username).charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] font-medium text-[#1d1d1f] truncate">{u.real_name}</span>
                                  <span className="text-[12px] text-[#86868b]">@{u.username}</span>
                                </div>
                                {u.dept_names.length > 0 && <div className="text-[12px] text-[#86868b] truncate">{u.dept_names.join('、')}</div>}
                              </div>
                              {!u.status && <span className="text-[11px] px-1.5 py-0.5 bg-[#f5f5f7] text-[#86868b] rounded-md flex-shrink-0">已禁用</span>}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              {/* 私有 */}
              {permKbType === 'private' && (() => {
                const creator = allUsers.find(u => u.id === createdBy);
                const creatorName = creator ? (creator.real_name || creator.username) : (createdBy ? `用户ID: ${createdBy}` : '未知');
                const creatorDept = creator?.dept_names.join('、') || '';
                return (
                  <div className="py-6 space-y-4">
                    <p className="text-[13px] text-[#86868b]">仅创建人本人可查看，其他人无法访问此知识库</p>
                    <div className="flex items-center gap-3 p-4 bg-[#f5f5f7] rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-[#0071e3] flex items-center justify-center text-white text-[14px] font-semibold flex-shrink-0">
                        {creatorName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium text-[#1d1d1f]">{creatorName}</span>
                          <span className="text-[12px] px-2 py-0.5 bg-[#0071e3]/10 text-[#0071e3] rounded-full">创建人</span>
                        </div>
                        {creatorDept && <p className="text-[12px] text-[#86868b] truncate mt-0.5">{creatorDept}</p>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#d2d2d7]/60 flex items-center justify-between gap-4 flex-shrink-0">
              <div className="flex-1">
                {permKbType === 'users' && (
                  <span className="text-[13px] text-[#86868b]">已选 <span className="font-semibold text-[#1d1d1f]">{checkedUserIds.size}</span> 位成员</span>
                )}
                {permError && <span className="text-[13px] text-red-500 block">{permError}</span>}
              </div>
              <div className="flex gap-3">
                <Dialog.Close asChild>
                  <button className="px-5 py-2 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg text-[14px] font-medium transition-all">取消</button>
                </Dialog.Close>
                <button onClick={handlePermSave} disabled={permSaving}
                  className="px-5 py-2 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-[14px] font-medium transition-all">
                  {permSaving ? '保存中...' : '保存权限'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
});

interface NewKnowledgeBaseCardProps {
  onClick?: () => void;
}

export function NewKnowledgeBaseCard({ onClick }: NewKnowledgeBaseCardProps) {
  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-[18px] border-2 border-dashed border-[#0071e3]/40 p-6 hover:bg-[#fff5f0] hover:border-[#ff6b35]/40 hover:shadow-[0_4px_20px_rgba(255,107,53,0.15)] transition-all duration-300 ease-out h-full min-h-[200px] flex flex-col items-center justify-center"
    >
      <div className="w-14 h-14 rounded-full bg-[#0071e3] group-hover:bg-[#ff6b35] flex items-center justify-center mb-4 transition-all duration-300">
        <span className="text-[32px] text-white transition-colors font-light leading-none">+</span>
      </div>
      <span className="text-[14px] font-medium text-[#0071e3] group-hover:text-[#ff6b35] transition-colors">新建知识库</span>
    </button>
  );
}
