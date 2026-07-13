import { useState, useEffect, useCallback } from 'react';
import { Search, RotateCcw, Plus, Shield, X, UserPlus, ChevronDown, ChevronRight } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  is_system: boolean;
  created_at: string;
  menu_permissions: string | null;
}

interface RoleUser {
  id: number;
  username: string;
  real_name: string;
  status: boolean;
  is_frozen: boolean;
  dept_ids: number[];
}

interface DeptInfo {
  id: number;
  name: string;
}

interface DeptTreeNode extends DeptInfo {
  children: DeptTreeNode[];
}

interface Permission {
  id: string;
  label: string;
  checked: boolean;
  children?: Permission[];
  expanded?: boolean;
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  if (!token) return { 'Content-Type': 'application/json' };
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-');
}

const EMPTY_FORM = { name: '', code: '', description: '' };

const DEFAULT_PERMISSIONS: Permission[] = [
  {
    id: 'system',
    label: '系统菜单',
    checked: false,
    expanded: true,
    children: [
      { id: 'dept', label: '部门管理', checked: false },
      { id: 'user', label: '用户管理', checked: false },
      { id: 'role', label: '角色管理', checked: false },
      { id: 'settings', label: '系统设置', checked: false },
    ],
  },
  {
    id: 'knowledge',
    label: '知识库操作',
    checked: false,
    expanded: true,
    children: [
      { id: 'manage-all', label: '管理所有知识库（添加、删除、改名和设权限）', checked: false },
      { id: 'view-all', label: '查看所有知识库', checked: false },
    ],
  },
];

export function RoleManagement() {
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add / Edit dialog
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState(EMPTY_FORM);
  const [roleFormError, setRoleFormError] = useState('');
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Associate users dialog (UI-only for now)
  const [associateDialogOpen, setAssociateDialogOpen] = useState(false);
  const [associatingRole, setAssociatingRole] = useState<Role | null>(null);
  const [roleUsers, setRoleUsers] = useState<RoleUser[]>([]);
  const [allUsers, setAllUsers] = useState<RoleUser[]>([]);
  const [selectUserDialogOpen, setSelectUserDialogOpen] = useState(false);
  const [searchUserAccount, setSearchUserAccount] = useState('');
  const [searchUserName, setSearchUserName] = useState('');
  const [selectedAvailableUsers, setSelectedAvailableUsers] = useState<number[]>([]);
  const [associateSubmitting, setAssociateSubmitting] = useState(false);
  const [deptList, setDeptList] = useState<DeptInfo[]>([]);
  const [expandedDepts, setExpandedDepts] = useState<Set<number | null>>(new Set());
  // 选择用户弹窗专用
  const [deptTree, setDeptTree] = useState<DeptTreeNode[]>([]);
  const [selectDlgDeptId, setSelectDlgDeptId] = useState<number | null>(null);
  const [expandedTreeDepts, setExpandedTreeDepts] = useState<Set<number>>(new Set());

  // Authorization dialog
  const [authorizationDialogOpen, setAuthorizationDialogOpen] = useState(false);
  const [authRole, setAuthRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>(DEFAULT_PERMISSIONS);
  const [authSaving, setAuthSaving] = useState(false);
  const [authError, setAuthError] = useState('');

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/roles', { headers: getAuthHeaders() });
      if (res.ok) setAllRoles(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  // Client-side filter
  const filteredRoles = allRoles.filter(r =>
    !appliedSearch || r.name.toLowerCase().includes(appliedSearch.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / pageSize));
  const pagedRoles = filteredRoles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSearch = () => { setAppliedSearch(searchName); setCurrentPage(1); };
  const handleReset = () => { setSearchName(''); setAppliedSearch(''); setCurrentPage(1); };

  // ── Add / Edit ──────────────────────────────────────────────────
  const handleOpenAdd = () => {
    setIsEditMode(false);
    setEditingRole(null);
    setRoleForm(EMPTY_FORM);
    setRoleFormError('');
    setRoleDialogOpen(true);
  };

  const handleOpenEdit = (role: Role) => {
    setIsEditMode(true);
    setEditingRole(role);
    setRoleForm({ name: role.name, code: role.code, description: role.description });
    setRoleFormError('');
    setRoleDialogOpen(true);
  };

  const handleRoleSubmit = async () => {
    if (!roleForm.name.trim()) { setRoleFormError('请填写角色名称'); return; }
    setRoleSubmitting(true);
    setRoleFormError('');
    try {
      const url = isEditMode ? `/api/roles/${editingRole!.id}` : '/api/roles';
      const method = isEditMode ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: roleForm.name.trim(),
          code: roleForm.code.trim(),
          description: roleForm.description.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRoleFormError(err.detail ?? '操作失败，请重试');
        return;
      }
      setRoleDialogOpen(false);
      await loadRoles();
    } catch {
      setRoleFormError('网络错误，请重试');
    } finally {
      setRoleSubmitting(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────
  const handleOpenDelete = (role: Role) => {
    setDeletingRole(role);
    setDeleteError('');
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRole) return;
    if (deletingRole.is_system) { setDeleteError('系统内置角色不可删除'); return; }
    setDeleteSubmitting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/roles/${deletingRole.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDeleteError(err.detail ?? '删除失败，请重试');
        return;
      }
      setDeleteDialogOpen(false);
      await loadRoles();
    } catch {
      setDeleteError('网络错误，请重试');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ── Associate users ─────────────────────────────────────────────
  const loadRoleUsers = useCallback(async (roleId: number) => {
    const [roleUsersRes, allUsersRes, deptsRes] = await Promise.all([
      fetch(`/api/roles/${roleId}/users`, { headers: getAuthHeaders() }),
      fetch('/api/users?skip=0&limit=10000', { headers: getAuthHeaders() }),
      fetch('/api/departments/tree', { headers: getAuthHeaders() }),
    ]);
    if (roleUsersRes.ok) {
      const data = await roleUsersRes.json();
      setRoleUsers(data.map((u: any) => ({
        id: u.id, username: u.username, real_name: u.real_name,
        status: u.status, is_frozen: u.is_frozen, dept_ids: u.dept_ids ?? [],
      })));
    }
    if (allUsersRes.ok) {
      const data = await allUsersRes.json();
      setAllUsers((data.items ?? []).map((u: any) => ({
        id: u.id, username: u.username, real_name: u.real_name,
        status: u.status, is_frozen: u.is_frozen, dept_ids: u.dept_ids ?? [],
      })));
    }
    if (deptsRes.ok) {
      const raw = await deptsRes.json();
      const rawTree: any[] = Array.isArray(raw) ? raw : [];
      // 展平用于关联用户树的部门名映射
      const list: DeptInfo[] = [];
      const buildTree = (nodes: any[]): DeptTreeNode[] =>
        nodes.map(n => {
          list.push({ id: n.id, name: n.name });
          return { id: n.id, name: n.name, children: buildTree(n.children ?? []) };
        });
      const tree = buildTree(rawTree);
      setDeptList(list);
      setDeptTree(tree);
      setExpandedDepts(new Set([...list.map(d => d.id as number | null), null]));
      // 选择用户弹窗：默认展开所有有子节点的部门
      const withChildren = new Set<number>();
      const collectParents = (nodes: DeptTreeNode[]) => {
        for (const n of nodes) {
          if (n.children.length) { withChildren.add(n.id); collectParents(n.children); }
        }
      };
      collectParents(tree);
      setExpandedTreeDepts(withChildren);
    }
  }, []);

  const handleOpenAssociate = (role: Role) => {
    setAssociatingRole(role);
    setSearchUserAccount('');
    setSearchUserName('');
    setSelectedAvailableUsers([]);
    setRoleUsers([]);
    setSelectDlgDeptId(null);
    setAssociateDialogOpen(true);
    loadRoleUsers(role.id);
  };

  const handleAssignUsers = async () => {
    if (!associatingRole || selectedAvailableUsers.length === 0) return;
    setAssociateSubmitting(true);
    try {
      const alreadyIds = new Set(roleUsers.map(u => u.id));
      const toAdd = selectedAvailableUsers.filter(id => !alreadyIds.has(id));
      await Promise.all(toAdd.map(userId =>
        fetch(`/api/roles/${associatingRole.id}/users/${userId}`, {
          method: 'POST', headers: getAuthHeaders(),
        })
      ));
      setSelectUserDialogOpen(false);
      setSelectedAvailableUsers([]);
      await loadRoleUsers(associatingRole.id);
    } finally {
      setAssociateSubmitting(false);
    }
  };


  // ── Authorization ────────────────────────────────────────────────
  const handleOpenAuthorization = (role: Role) => {
    setAuthRole(role);
    setAuthError('');

    // Parse saved permission keys from role.menu_permissions
    let savedKeys: string[] = [];
    try {
      savedKeys = JSON.parse(role.menu_permissions ?? '[]');
    } catch { savedKeys = []; }

    const applyKeys = (perms: Permission[]): Permission[] =>
      perms.map(p => {
        const children = p.children ? applyKeys(p.children) : undefined;
        const checked = children
          ? children.every(c => c.checked)
          : savedKeys.includes(p.id);
        return { ...p, checked, children };
      });

    setPermissions(applyKeys(DEFAULT_PERMISSIONS.map(p => ({ ...p, children: p.children?.map(c => ({ ...c })) }))));
    setAuthorizationDialogOpen(true);
  };

  const handleSavePermissions = async () => {
    if (!authRole) return;
    // Collect all checked leaf keys
    const keys: string[] = [];
    const collect = (perms: Permission[]) => {
      perms.forEach(p => {
        if (p.children) collect(p.children);
        else if (p.checked) keys.push(p.id);
      });
    };
    collect(permissions);

    setAuthSaving(true);
    setAuthError('');
    try {
      const res = await fetch(`/api/roles/${authRole.id}/menu-permissions`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ menu_permissions: JSON.stringify(keys) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAuthError(err.detail ?? '保存失败，请重试');
        return;
      }
      // Refresh local role list so reopening the dialog reflects saved state
      await loadRoles();
      setAuthorizationDialogOpen(false);
    } catch {
      setAuthError('网络错误，请重试');
    } finally {
      setAuthSaving(false);
    }
  };

  const togglePermissionExpand = (permId: string) => {
    setPermissions(prev => prev.map(p =>
      p.id === permId ? { ...p, expanded: !p.expanded }
        : { ...p, children: p.children?.map(c => c.id === permId ? { ...c, expanded: !c.expanded } : c) }
    ));
  };

  const togglePermissionCheck = (permId: string) => {
    const update = (perms: Permission[]): Permission[] => perms.map(p => {
      if (p.id === permId) {
        const checked = !p.checked;
        return { ...p, checked, children: p.children?.map(c => ({ ...c, checked })) };
      }
      if (p.children) {
        const children = update(p.children);
        return { ...p, children, checked: children.every(c => c.checked) };
      }
      return p;
    });
    setPermissions(update(permissions));
  };

  return (
    <div className="size-full flex flex-col bg-[#f5f5f7]">
      {/* Header */}
      <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center px-8">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
          <h1 className="text-[21px] font-semibold text-[#1d1d1f]">角色管理</h1>
        </div>
      </div>

      {/* Search */}
      <div className="bg-[#fbfbfd] border-b border-[#d2d2d7]/50 px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-[14px] text-[#86868b] whitespace-nowrap">角色名称:</label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="请输入角色名称"
              className="w-56 px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
            />
          </div>
          <button onClick={handleSearch} className="px-5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] rounded-lg transition-all flex items-center gap-2 text-[14px] font-medium text-white">
            <Search className="w-4 h-4" strokeWidth={2} />查询
          </button>
          <button onClick={handleReset} className="px-5 py-1.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all flex items-center gap-2 text-[14px] font-medium text-[#1d1d1f]">
            <RotateCcw className="w-4 h-4" strokeWidth={1.5} />重置
          </button>
          <div className="flex-1" />
          <button onClick={handleOpenAdd} className="px-5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] rounded-lg transition-all flex items-center gap-2 text-[14px] font-medium text-white">
            <Plus className="w-4 h-4" strokeWidth={2} />新增
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f5f5f7] border-b border-[#d2d2d7]">
                <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">角色名称</th>
                <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">角色编码</th>
                <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">描述</th>
                <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">创建时间</th>
                <th className="px-6 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[14px] text-[#86868b]">加载中...</td></tr>
              ) : pagedRoles.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[14px] text-[#86868b]">暂无数据</td></tr>
              ) : pagedRoles.map((role) => (
                <tr key={role.id} className="border-b border-[#d2d2d7]/50 hover:bg-[#f5f5f7]/50 transition-colors">
                  <td className="px-6 py-3 text-[14px] text-[#1d1d1f]">
                    <div className="flex items-center gap-2">
                      {role.name}
                      {role.is_system && (
                        <span className="px-1.5 py-0.5 bg-orange-50 text-orange-600 text-[11px] rounded border border-orange-200">系统</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-[14px] text-[#86868b]">{role.code}</td>
                  <td className="px-6 py-3 text-[14px] text-[#86868b]">{role.description}</td>
                  <td className="px-6 py-3 text-[14px] text-[#86868b]">{formatDate(role.created_at)}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={() => handleOpenAssociate(role)} className="text-[14px] text-[#0071e3] hover:text-[#0077ed] transition-colors">关联用户</button>
                      <span className="text-[#d2d2d7]">|</span>
                      <button onClick={() => handleOpenAuthorization(role)} className="text-[14px] text-[#0071e3] hover:text-[#0077ed] transition-colors">授权</button>
                      <span className="text-[#d2d2d7]">|</span>
                      <button onClick={() => handleOpenEdit(role)} className="text-[14px] text-[#0071e3] hover:text-[#0077ed] transition-colors">编辑</button>
                      {!role.is_system && (<>
                        <span className="text-[#d2d2d7]">|</span>
                        <button onClick={() => handleOpenDelete(role)} className="text-[14px] text-red-500 hover:text-red-600 transition-colors">删除</button>
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-[14px] text-[#86868b]">共 <span className="text-[#1d1d1f] font-medium">{filteredRoles.length}</span> 条数据</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(page => (
                <button key={page} onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg text-[14px] transition-all ${currentPage === page ? 'bg-[#0071e3] text-white' : 'bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]'}`}>
                  {page}
                </button>
              ))}
            </div>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none text-[14px] text-[#1d1d1f]">
              <option value="10">10条/页</option>
              <option value="20">20条/页</option>
              <option value="50">50条/页</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Add / Edit Role Dialog ── */}
      <Dialog.Root open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-md z-50">
            <div className="border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">{isEditMode ? '编辑角色' : '新增角色'}</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
            <div className="p-6 space-y-4">
              {roleFormError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600">{roleFormError}</div>
              )}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">角色名称<span className="text-red-500">*</span></label>
                <input type="text" value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="请输入角色名称"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">角色编码</label>
                <input type="text" value={roleForm.code}
                  onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })}
                  placeholder="请输入角色编码（可选）"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">描述</label>
                <textarea value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  placeholder="请输入描述（可选）"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] resize-none"
                />
              </div>
            </div>
            <div className="border-t border-[#d2d2d7] px-6 py-4 flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">取消</button>
              </Dialog.Close>
              <button onClick={handleRoleSubmit} disabled={roleSubmitting}
                className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-lg transition-all text-[14px] font-medium">
                {roleSubmitting ? '提交中...' : '确认'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-sm z-50 p-6">
            <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f] mb-2">确认删除</Dialog.Title>
            <p className="text-[14px] text-[#86868b] mb-4">
              确定要删除角色 <span className="font-medium text-[#1d1d1f]">「{deletingRole?.name}」</span> 吗？此操作不可撤销。
            </p>
            {deleteError && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600">{deleteError}</div>
            )}
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">取消</button>
              </Dialog.Close>
              <button onClick={handleDeleteConfirm} disabled={deleteSubmitting}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-all text-[14px] font-medium">
                {deleteSubmitting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Associate Users Dialog ── */}
      <Dialog.Root open={associateDialogOpen} onOpenChange={setAssociateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-3xl max-h-[90vh] overflow-hidden z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">
                角色关联用户 — {associatingRole?.name}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>

            {/* Toolbar */}
            <div className="flex-shrink-0 px-6 py-3 border-b border-[#d2d2d7]/50 bg-[#fbfbfd] flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-[14px] text-[#86868b] whitespace-nowrap">搜索:</label>
                <input type="text" value={searchUserAccount}
                  onChange={(e) => setSearchUserAccount(e.target.value)}
                  placeholder="账号或姓名"
                  className="w-44 px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]" />
              </div>
              <span className="text-[13px] text-[#86868b]">共 {roleUsers.length} 人</span>
              <div className="flex-1" />
              <button
                onClick={() => { setSelectedAvailableUsers([]); setSearchUserName(''); setSelectUserDialogOpen(true); }}
                className="px-5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] rounded-lg transition-all flex items-center gap-2 text-[14px] font-medium text-white"
              >
                <UserPlus className="w-4 h-4" strokeWidth={2} />选择已有用户
              </button>
            </div>

            {/* Tree body */}
            <div className="flex-1 overflow-auto">
              {(() => {
                const keyword = searchUserAccount.toLowerCase();
                const filtered = roleUsers.filter(u =>
                  !keyword ||
                  u.username.toLowerCase().includes(keyword) ||
                  u.real_name.toLowerCase().includes(keyword)
                );

                if (filtered.length === 0) {
                  return (
                    <div className="py-14 text-center text-[14px] text-[#86868b]">
                      {roleUsers.length === 0 ? '暂无关联用户' : '无匹配用户'}
                    </div>
                  );
                }

                // Group by dept_ids (user may belong to multiple depts)
                const deptMap = new Map(deptList.map(d => [d.id, d.name]));
                const grouped = new Map<number | null, RoleUser[]>();
                for (const u of filtered) {
                  if (u.dept_ids.length === 0) {
                    if (!grouped.has(null)) grouped.set(null, []);
                    grouped.get(null)!.push(u);
                  } else {
                    for (const did of u.dept_ids) {
                      if (!grouped.has(did)) grouped.set(did, []);
                      grouped.get(did)!.push(u);
                    }
                  }
                }
                const groups = [...grouped.entries()]
                  .map(([deptId, users]) => ({
                    deptId,
                    deptName: deptId != null ? (deptMap.get(deptId) ?? `部门${deptId}`) : '未分配部门',
                    users,
                  }))
                  .sort((a, b) => {
                    if (a.deptId === null) return 1;
                    if (b.deptId === null) return -1;
                    return a.deptName.localeCompare(b.deptName, 'zh-CN');
                  });

                const toggleDept = (deptId: number | null) => {
                  setExpandedDepts(prev => {
                    const next = new Set(prev);
                    if (next.has(deptId)) next.delete(deptId);
                    else next.add(deptId);
                    return next;
                  });
                };

                return groups.map(group => {
                  const isExpanded = expandedDepts.has(group.deptId);
                  return (
                    <div key={group.deptId ?? 'null'}>
                      {/* Dept header row */}
                      <button
                        onClick={() => toggleDept(group.deptId)}
                        className="w-full flex items-center gap-2 px-5 py-2.5 bg-[#f5f5f7] hover:bg-[#ebebed] transition-colors border-b border-[#d2d2d7]/60 text-left"
                      >
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-[#86868b] flex-shrink-0" strokeWidth={1.5} />
                          : <ChevronRight className="w-4 h-4 text-[#86868b] flex-shrink-0" strokeWidth={1.5} />
                        }
                        <span className="text-[14px] font-semibold text-[#1d1d1f]">{group.deptName}</span>
                        <span className="text-[12px] text-[#86868b] ml-0.5">({group.users.length} 人)</span>
                      </button>

                      {/* Users under dept */}
                      {isExpanded && group.users.map(u => (
                        <div
                          key={u.id}
                          className="flex items-center gap-4 pl-11 pr-5 py-2.5 border-b border-[#d2d2d7]/30 hover:bg-[#f5f5f7]/60 transition-colors"
                        >
                          <span className="w-32 text-[13px] text-[#86868b] truncate">{u.username}</span>
                          <span className="flex-1 text-[14px] text-[#1d1d1f]">{u.real_name}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            u.is_frozen ? 'bg-blue-50 text-blue-700' : u.status ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {u.is_frozen ? '冻结' : u.status ? '正常' : '禁用'}
                          </span>
                          <button
                            onClick={async () => {
                              if (!associatingRole) return;
                              await fetch(`/api/roles/${associatingRole.id}/users/${u.id}`, {
                                method: 'DELETE', headers: getAuthHeaders(),
                              });
                              await loadRoleUsers(associatingRole.id);
                            }}
                            className="text-[13px] text-red-500 hover:text-red-600 transition-colors whitespace-nowrap"
                          >
                            取消关联
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Select Users Dialog (left: dept tree, right: users) ── */}
      <Dialog.Root open={selectUserDialogOpen} onOpenChange={setSelectUserDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-[880px] max-w-[95vw] h-[82vh] z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">选择用户</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>

            {/* Body: left tree + right list */}
            <div className="flex-1 flex min-h-0">

              {/* ── Left: dept tree ── */}
              <div className="w-52 flex-shrink-0 border-r border-[#d2d2d7] overflow-y-auto bg-[#fafafa]">
                {/* "全部" */}
                <button
                  onClick={() => setSelectDlgDeptId(null)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors
                    ${selectDlgDeptId === null ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'text-[#1d1d1f] hover:bg-[#f0f0f5]'}`}
                >
                  全部部门
                </button>
                {/* Recursive tree */}
                {(() => {
                  const renderTree = (nodes: DeptTreeNode[], depth: number): React.ReactNode =>
                    nodes.map(node => (
                      <div key={node.id}>
                        <div
                          className={`flex items-center transition-colors cursor-pointer
                            ${selectDlgDeptId === node.id ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'text-[#1d1d1f] hover:bg-[#f0f0f5]'}`}
                          style={{ paddingLeft: `${16 + depth * 14}px` }}
                          onClick={() => setSelectDlgDeptId(node.id)}
                        >
                          {node.children.length > 0 ? (
                            <button
                              className="p-1 flex-shrink-0"
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedTreeDepts(prev => {
                                  const next = new Set(prev);
                                  if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                                  return next;
                                });
                              }}
                            >
                              {expandedTreeDepts.has(node.id)
                                ? <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                                : <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />}
                            </button>
                          ) : (
                            <span className="w-5.5 flex-shrink-0" />
                          )}
                          <span className="py-2 pr-3 text-[13px] truncate">{node.name}</span>
                        </div>
                        {expandedTreeDepts.has(node.id) && node.children.length > 0 &&
                          renderTree(node.children, depth + 1)}
                      </div>
                    ));
                  return renderTree(deptTree, 0);
                })()}
              </div>

              {/* ── Right: users list ── */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Search bar */}
                <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[#d2d2d7]/50 bg-[#fbfbfd]">
                  <input
                    type="text" value={searchUserName}
                    onChange={e => setSearchUserName(e.target.value)}
                    placeholder="搜索姓名或账号"
                    className="w-48 px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] text-[14px] text-[#1d1d1f]"
                  />
                  <button onClick={() => setSearchUserName('')}
                    className="px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[14px] text-[#1d1d1f] flex items-center gap-1.5 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />重置
                  </button>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                  {(() => {
                    const alreadyIds = new Set(roleUsers.map(u => u.id));
                    const kw = searchUserName.toLowerCase();
                    const visible = allUsers.filter(u => {
                      if (selectDlgDeptId !== null && !u.dept_ids.includes(selectDlgDeptId)) return false;
                      if (kw && !u.username.toLowerCase().includes(kw) && !u.real_name.toLowerCase().includes(kw)) return false;
                      return true;
                    });
                    // selectable = not already associated
                    const selectable = visible.filter(u => !alreadyIds.has(u.id));
                    const allSelectableChecked = selectable.length > 0 && selectable.every(u => selectedAvailableUsers.includes(u.id));

                    return (
                      <table className="w-full">
                        <thead className="sticky top-0 bg-[#f5f5f7] border-b border-[#d2d2d7]">
                          <tr>
                            <th className="px-4 py-3 w-10">
                              <input type="checkbox"
                                checked={allSelectableChecked}
                                onChange={e => setSelectedAvailableUsers(
                                  e.target.checked ? selectable.map(u => u.id) : []
                                )}
                                className="w-4 h-4 rounded border-[#d2d2d7] text-[#0071e3]" />
                            </th>
                            <th className="px-4 py-3 text-left text-[13px] font-medium text-[#1d1d1f]">姓名</th>
                            <th className="px-4 py-3 text-left text-[13px] font-medium text-[#1d1d1f]">账号</th>
                            <th className="px-4 py-3 text-left text-[13px] font-medium text-[#1d1d1f]">状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.length === 0 ? (
                            <tr><td colSpan={4} className="py-10 text-center text-[14px] text-[#86868b]">暂无用户</td></tr>
                          ) : visible.map(u => {
                            const linked = alreadyIds.has(u.id);
                            return (
                              <tr key={u.id} className={`border-b border-[#d2d2d7]/40 transition-colors ${linked ? 'bg-[#f5f5f7]/40' : 'hover:bg-[#f5f5f7]/50'}`}>
                                <td className="px-4 py-2.5">
                                  <input type="checkbox"
                                    checked={linked || selectedAvailableUsers.includes(u.id)}
                                    disabled={linked}
                                    onChange={e => setSelectedAvailableUsers(e.target.checked
                                      ? [...selectedAvailableUsers, u.id]
                                      : selectedAvailableUsers.filter(id => id !== u.id))}
                                    className="w-4 h-4 rounded border-[#d2d2d7] text-[#0071e3] disabled:opacity-60 disabled:cursor-not-allowed" />
                                </td>
                                <td className="px-4 py-2.5 text-[13px] text-[#1d1d1f]">
                                  <span>{u.real_name}</span>
                                  {linked && <span className="ml-2 px-1.5 py-0.5 bg-[#0071e3]/10 text-[#0071e3] text-[11px] rounded">已关联</span>}
                                </td>
                                <td className="px-4 py-2.5 text-[13px] text-[#86868b]">{u.username}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium
                                    ${u.is_frozen ? 'bg-blue-50 text-blue-700' : u.status ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {u.is_frozen ? '冻结' : u.status ? '正常' : '禁用'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-[#d2d2d7] px-6 py-4 flex justify-between items-center bg-[#fbfbfd]">
              <span className="text-[13px] text-[#86868b]">
                已选 <span className="text-[#0071e3] font-medium">{selectedAvailableUsers.length}</span> 人
              </span>
              <div className="flex gap-3">
                <Dialog.Close asChild>
                  <button className="px-6 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg text-[14px] font-medium transition-colors">取消</button>
                </Dialog.Close>
                <button onClick={handleAssignUsers}
                  disabled={associateSubmitting || selectedAvailableUsers.length === 0}
                  className="px-6 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-lg text-[14px] font-medium transition-colors">
                  {associateSubmitting ? '添加中...' : `确认添加 (${selectedAvailableUsers.length})`}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Authorization Dialog ── */}
      <Dialog.Root open={authorizationDialogOpen} onOpenChange={setAuthorizationDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg max-h-[90vh] overflow-hidden z-50">
            <div className="border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">
                角色权限配置 — {authRole?.name}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-160px)] space-y-2">
              {permissions.map((perm) => (
                <div key={perm.id}>
                  <div className="flex items-center gap-2 py-1">
                    {perm.children && (
                      <button onClick={() => togglePermissionExpand(perm.id)} className="p-0.5">
                        {perm.expanded ? <ChevronDown className="w-4 h-4 text-[#1d1d1f]" strokeWidth={1.5} /> : <ChevronRight className="w-4 h-4 text-[#1d1d1f]" strokeWidth={1.5} />}
                      </button>
                    )}
                    <input type="checkbox" checked={perm.checked} onChange={() => togglePermissionCheck(perm.id)}
                      className="w-4 h-4 rounded border-[#d2d2d7] text-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/30" />
                    <label className="text-[14px] text-[#1d1d1f] cursor-pointer select-none" onClick={() => togglePermissionCheck(perm.id)}>{perm.label}</label>
                  </div>
                  {perm.expanded && perm.children && (
                    <div className="ml-10 space-y-1 mt-1 pl-4 border-l-2 border-[#e5e5e7]">
                      {perm.children.map((child) => (
                        <div key={child.id} className="flex items-center gap-2 py-1">
                          <input type="checkbox" checked={child.checked} onChange={() => togglePermissionCheck(child.id)}
                            className="w-4 h-4 rounded border-[#d2d2d7] text-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/30" />
                          <label className="text-[14px] text-[#86868b] cursor-pointer select-none" onClick={() => togglePermissionCheck(child.id)}>{child.label}</label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-[#d2d2d7] px-6 py-4 space-y-3">
              {authError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600">{authError}</div>
              )}
              <div className="flex gap-3 justify-end">
              <Dialog.Close asChild>
                <button className="px-6 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">取消</button>
              </Dialog.Close>
              <button onClick={handleSavePermissions} disabled={authSaving}
                className="px-6 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-lg transition-all text-[14px] font-medium">
                {authSaving ? '保存中...' : '保存并关闭'}
              </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
