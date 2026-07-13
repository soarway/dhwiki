import React, { useState, useEffect, useCallback } from 'react';
import { Search, RotateCcw, Plus, ChevronDown, Users, Eye, EyeOff, X, ChevronRight } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface User {
  id: number;
  username: string;
  real_name: string;
  email: string;
  avatar: string | null;
  gender: string | null;
  phone: string | null;
  status: boolean;
  is_frozen: boolean;
  auth_source: string;
  last_login_at: string | null;
  created_at: string;
  dept_names: string[];
  dept_ids: number[];
}

interface Department {
  id: number;
  name: string;
  children?: Department[];
  expanded?: boolean;
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  if (!token) return { 'Content-Type': 'application/json' };
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function addExpandedFlag(depts: Department[]): Department[] {
  return depts.map((d) => ({
    ...d,
    expanded: true,
    children: d.children ? addExpandedFlag(d.children) : [],
  }));
}

function getUserStatus(user: User): string {
  if (user.is_frozen) return '冻结';
  if (!user.status) return '禁用';
  return '正常';
}

const EMPTY_FORM = {
  username: '',
  password: '',
  confirmPassword: '',
  real_name: '',
  email: '',
  gender: '',
  phone: '',
};

export function UserManagement() {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Search filters
  const [searchAccount, setSearchAccount] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchGender, setSearchGender] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    account: '', name: '', gender: '', status: '',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jumpPage, setJumpPage] = useState('');

  // Selection
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

  // Dialogs
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [deptSelectDialogOpen, setDeptSelectDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newUserForm, setNewUserForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ real_name: '', email: '', gender: '', phone: '' });
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptSelectOpen, setEditDeptSelectOpen] = useState(false);

  // Departments (for selection dialog)
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [selectedDeptName, setSelectedDeptName] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users?skip=0&limit=10000', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    fetch('/api/departments/tree', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Department[]) => setDepartments(addExpandedFlag(data)))
      .catch(() => {});
  }, [loadUsers]);

  // Client-side filtering
  const filteredUsers = allUsers.filter((u) => {
    if (appliedFilters.account && !u.username.toLowerCase().includes(appliedFilters.account.toLowerCase())) return false;
    if (appliedFilters.name && !u.real_name.toLowerCase().includes(appliedFilters.name.toLowerCase())) return false;
    if (appliedFilters.gender && u.gender !== appliedFilters.gender) return false;
    if (appliedFilters.status) {
      const s = getUserStatus(u);
      if (appliedFilters.status === '正常' && s !== '正常') return false;
      if (appliedFilters.status === '冻结' && s !== '冻结') return false;
      if (appliedFilters.status === '禁用' && s !== '禁用') return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSearch = () => {
    setAppliedFilters({ account: searchAccount, name: searchName, gender: searchGender, status: searchStatus });
    setCurrentPage(1);
    setSelectedUsers([]);
  };

  const handleReset = () => {
    setSearchAccount('');
    setSearchName('');
    setSearchGender('');
    setSearchStatus('');
    setAppliedFilters({ account: '', name: '', gender: '', status: '' });
    setCurrentPage(1);
    setSelectedUsers([]);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedUsers(checked ? pagedUsers.map(u => u.id) : []);
  };

  const handleSelectUser = (userId: number, checked: boolean) => {
    setSelectedUsers(checked ? [...selectedUsers, userId] : selectedUsers.filter(id => id !== userId));
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({
      real_name: user.real_name,
      email: user.email,
      gender: user.gender ?? '',
      phone: user.phone ?? '',
    });
    setEditError('');
    // Pre-populate dept from first dept (users typically have one dept)
    if (user.dept_ids.length > 0) {
      setEditDeptId(user.dept_ids[0]);
      setEditDeptName(user.dept_names[0] ?? '');
    } else {
      setEditDeptId(null);
      setEditDeptName('');
    }
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editForm.real_name.trim() || !editForm.email.trim()) {
      setEditError('姓名和邮箱不能为空');
      return;
    }
    if (!editingUser) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          real_name: editForm.real_name.trim(),
          email: editForm.email.trim(),
          gender: editForm.gender || null,
          phone: editForm.phone || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setEditError(err.detail ?? '保存失败，请重试');
        return;
      }
      // Sync department: remove old depts that differ, assign new one if changed
      const oldDeptIds = editingUser.dept_ids ?? [];
      const newDeptId = editDeptId;
      // Remove all old depts
      await Promise.all(oldDeptIds.map(did =>
        fetch(`/api/users/${editingUser.id}/departments/${did}`, { method: 'DELETE', headers: getAuthHeaders() })
      ));
      // Assign new dept if selected
      if (newDeptId) {
        await fetch(`/api/users/${editingUser.id}/departments/${newDeptId}`, { method: 'POST', headers: getAuthHeaders() });
      }
      setEditDialogOpen(false);
      await loadUsers();
    } catch {
      setEditError('网络错误，请重试');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleFreeze = async (user: User) => {
    const action = user.is_frozen ? 'unfreeze' : 'freeze';
    const res = await fetch(`/api/users/${user.id}/${action}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    });
    if (res.ok) loadUsers();
  };

  const handleAddUser = async () => {
    if (!newUserForm.username.trim() || !newUserForm.password || !newUserForm.real_name.trim() || !newUserForm.email.trim()) {
      setFormError('请填写所有必填项');
      return;
    }
    if (newUserForm.password !== newUserForm.confirmPassword) {
      setFormError('两次密码输入不一致');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          username: newUserForm.username.trim(),
          real_name: newUserForm.real_name.trim(),
          email: newUserForm.email.trim(),
          password: newUserForm.password,
          gender: newUserForm.gender || null,
          phone: newUserForm.phone || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err.detail ?? '创建失败，请重试');
        return;
      }
      const createdUser = await res.json();
      if (selectedDeptId) {
        await fetch(`/api/users/${createdUser.id}/departments/${selectedDeptId}`, {
          method: 'POST', headers: getAuthHeaders(),
        });
      }
      setAddUserDialogOpen(false);
      setNewUserForm(EMPTY_FORM);
      setSelectedDeptId(null);
      setSelectedDeptName('');
      await loadUsers();
    } catch {
      setFormError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // Department tree (for selection dialog - UI only, backend UserCreate has no dept field)
  const toggleDeptExpand = (deptId: number) => {
    const update = (depts: Department[]): Department[] =>
      depts.map(d => d.id === deptId
        ? { ...d, expanded: !d.expanded }
        : { ...d, children: d.children ? update(d.children) : d.children }
      );
    setDepartments(update(departments));
  };

  const renderDepartmentTree = (depts: Department[], level: number = 0) => {
    return depts.map((dept) => (
      <div key={dept.id}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedDeptId === dept.id ? 'bg-[#0071e3]/15 text-[#0071e3]' : 'hover:bg-[#0071e3]/10 text-[#1d1d1f]'}`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => { setSelectedDeptId(dept.id); setSelectedDeptName(dept.name); setDeptSelectDialogOpen(false); }}
        >
          {dept.children && dept.children.length > 0 ? (
            <button onClick={(e) => { e.stopPropagation(); toggleDeptExpand(dept.id); }} className="p-0.5">
              {dept.expanded
                ? <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
                : <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
              }
            </button>
          ) : (
            <span className="w-5"></span>
          )}
          <span className="text-[14px]">{dept.name}</span>
        </div>
        {dept.expanded && dept.children && renderDepartmentTree(dept.children, level + 1)}
      </div>
    ));
  };

  const renderDepartmentTreeForEdit = (depts: Department[], level: number = 0): React.ReactNode => {
    return depts.map((dept) => (
      <div key={dept.id}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${editDeptId === dept.id ? 'bg-[#0071e3]/15 text-[#0071e3]' : 'hover:bg-[#0071e3]/10 text-[#1d1d1f]'}`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => { setEditDeptId(dept.id); setEditDeptName(dept.name); setEditDeptSelectOpen(false); }}
        >
          {dept.children && dept.children.length > 0 ? (
            <button onClick={(e) => { e.stopPropagation(); toggleDeptExpand(dept.id); }} className="p-0.5">
              {dept.expanded
                ? <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
                : <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
              }
            </button>
          ) : (
            <span className="w-5"></span>
          )}
          <span className="text-[14px]">{dept.name}</span>
        </div>
        {dept.expanded && dept.children && renderDepartmentTreeForEdit(dept.children, level + 1)}
      </div>
    ));
  };

  // Pagination helpers
  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
    if (currentPage >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  const handleJumpPage = () => {
    const p = parseInt(jumpPage, 10);
    if (p >= 1 && p <= totalPages) { setCurrentPage(p); setJumpPage(''); }
  };

  return (
    <div className="size-full flex flex-col bg-[#f5f5f7]">
      {/* Header */}
      <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center px-8">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
          <h1 className="text-[21px] font-semibold text-[#1d1d1f]">用户管理</h1>
        </div>
      </div>

      {/* Search Filters */}
      <div className="bg-[#fbfbfd] border-b border-[#d2d2d7]/50 px-8 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[14px] text-[#86868b] whitespace-nowrap">账号:</label>
            <input
              type="text"
              value={searchAccount}
              onChange={(e) => setSearchAccount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="请输入账号"
              className="w-40 px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[14px] text-[#86868b] whitespace-nowrap">姓名:</label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="请输入姓名"
              className="w-40 px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[14px] text-[#86868b] whitespace-nowrap">性别:</label>
            <select
              value={searchGender}
              onChange={(e) => setSearchGender(e.target.value)}
              className="w-36 px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
            >
              <option value="">全部</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[14px] text-[#86868b] whitespace-nowrap">状态:</label>
            <select
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
              className="w-36 px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
            >
              <option value="">全部</option>
              <option value="正常">正常</option>
              <option value="冻结">冻结</option>
              <option value="禁用">禁用</option>
            </select>
          </div>

          <button
            onClick={handleSearch}
            className="px-5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] rounded-lg transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-white"
          >
            <Search className="w-[16px] h-[16px]" strokeWidth={2} />
            查询
          </button>

          <button
            onClick={handleReset}
            className="px-5 py-1.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] hover:border-[#86868b] transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-[#1d1d1f]"
          >
            <RotateCcw className="w-[16px] h-[16px]" strokeWidth={1.5} />
            重置
          </button>

          <div className="flex-1"></div>

          <button
            onClick={() => { setNewUserForm(EMPTY_FORM); setFormError(''); setSelectedDeptId(null); setSelectedDeptName(''); setAddUserDialogOpen(true); }}
            className="px-5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] rounded-lg transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-white"
          >
            <Plus className="w-[16px] h-[16px]" strokeWidth={2} />
            新增
          </button>
        </div>
      </div>

      {/* User Table */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="bg-white rounded-xl border border-[#d2d2d7] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f5f5f7] border-b border-[#d2d2d7]">
                <th className="px-4 py-3 text-left w-12">
                  <input
                    type="checkbox"
                    checked={pagedUsers.length > 0 && pagedUsers.every(u => selectedUsers.includes(u.id))}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-[#d2d2d7] text-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/30"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">用户账号</th>
                <th className="px-4 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">用户姓名</th>
                <th className="px-4 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">性别</th>
                <th className="px-4 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">邮箱</th>
                <th className="px-4 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">手机号</th>
                <th className="px-4 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">所属部门</th>
                <th className="px-4 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">状态</th>
                <th className="px-4 py-3 text-left text-[14px] font-medium text-[#1d1d1f]">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[14px] text-[#86868b]">加载中...</td>
                </tr>
              ) : pagedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[14px] text-[#86868b]">暂无数据</td>
                </tr>
              ) : pagedUsers.map((user) => {
                const statusText = getUserStatus(user);
                return (
                  <tr key={user.id} className="border-b border-[#d2d2d7]/50 hover:bg-[#f5f5f7]/50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                        className="w-4 h-4 rounded border-[#d2d2d7] text-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/30"
                      />
                    </td>
                    <td className="px-4 py-3 text-[14px] text-[#1d1d1f]">{user.username}</td>
                    <td className="px-4 py-3 text-[14px] text-[#1d1d1f]">{user.real_name}</td>
                    <td className="px-4 py-3 text-[14px] text-[#1d1d1f]">{user.gender ?? ''}</td>
                    <td className="px-4 py-3 text-[14px] text-[#1d1d1f]">{user.email}</td>
                    <td className="px-4 py-3 text-[14px] text-[#1d1d1f]">{user.phone ?? ''}</td>
                    <td className="px-4 py-3 text-[14px] text-[#86868b]">{(user.dept_names ?? []).join('、') || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium ${
                        statusText === '正常' ? 'bg-green-50 text-green-700' :
                        statusText === '冻结' ? 'bg-blue-50 text-blue-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {statusText}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="text-[14px] text-[#0071e3] hover:text-[#0077ed] transition-colors"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleFreeze(user)}
                          className="text-[14px] text-[#0071e3] hover:text-[#0077ed] transition-colors"
                        >
                          {user.is_frozen ? '解冻' : '冻结'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-[14px] text-[#86868b]">
            共 <span className="text-[#1d1d1f] font-medium">{filteredUsers.length}</span> 条数据
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, i) =>
                page === '...' ? (
                  <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-[14px] text-[#86868b]">...</span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page as number)}
                    className={`w-8 h-8 rounded-lg text-[14px] transition-all ${
                      currentPage === page
                        ? 'bg-[#0071e3] text-white'
                        : 'bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]'
                    }`}
                  >
                    {page}
                  </button>
                )
              )}
            </div>

            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-3 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
            >
              <option value="10">10条/页</option>
              <option value="20">20条/页</option>
              <option value="50">50条/页</option>
              <option value="100">100条/页</option>
            </select>

            <div className="flex items-center gap-2">
              <span className="text-[14px] text-[#86868b]">跳至</span>
              <input
                type="number"
                min="1"
                max={totalPages}
                value={jumpPage}
                onChange={(e) => setJumpPage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJumpPage()}
                className="w-16 px-2 py-1.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] text-center"
              />
              <span className="text-[14px] text-[#86868b]">页</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog.Root open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg max-h-[90vh] overflow-y-auto z-50">
            <div className="sticky top-0 bg-white border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">新增用户</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>

            <div className="p-6 space-y-4">
              {formError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600">
                  {formError}
                </div>
              )}

              {/* Username */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  用户账号<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                  placeholder="请输入用户账号"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              {/* Real Name */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  用户姓名<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newUserForm.real_name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, real_name: e.target.value })}
                  placeholder="请输入用户姓名"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  邮箱<span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  placeholder="请输入邮箱"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  登录密码<span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    placeholder="请输入登录密码"
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] pr-12"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} /> : <Eye className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  确认密码<span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={newUserForm.confirmPassword}
                    onChange={(e) => setNewUserForm({ ...newUserForm, confirmPassword: e.target.value })}
                    placeholder="请再次输入密码"
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] pr-12"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                    {showConfirmPassword ? <EyeOff className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} /> : <Eye className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {/* Gender */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">性别</label>
                <select
                  value={newUserForm.gender}
                  onChange={(e) => setNewUserForm({ ...newUserForm, gender: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                >
                  <option value="">请选择性别</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">手机号码</label>
                <input
                  type="tel"
                  value={newUserForm.phone}
                  onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                  placeholder="请输入手机号码"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">所属部门</label>
                <div className="flex gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] text-[#1d1d1f] truncate">
                    {selectedDeptName || <span className="text-[#86868b]">请选择部门（可选）</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeptSelectDialogOpen(true)}
                    className="px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all text-[14px] text-[#1d1d1f] whitespace-nowrap"
                  >
                    选择
                  </button>
                  {selectedDeptId && (
                    <button
                      type="button"
                      onClick={() => { setSelectedDeptId(null); setSelectedDeptName(''); }}
                      className="px-3 py-2.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all text-[14px] text-[#86868b]"
                    >
                      <X className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>

            </div>

            <div className="sticky bottom-0 bg-white border-t border-[#d2d2d7] px-6 py-4 flex gap-3 rounded-b-2xl">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">
                  取消
                </button>
              </Dialog.Close>
              <button
                onClick={handleAddUser}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-lg transition-all text-[14px] font-medium"
              >
                {submitting ? '创建中...' : '确认'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit User Dialog */}
      <Dialog.Root open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg z-50">
            <div className="border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">
                编辑用户 — {editingUser?.username}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>

            <div className="p-6 space-y-4">
              {editError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  用户姓名<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.real_name}
                  onChange={(e) => setEditForm({ ...editForm, real_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  邮箱<span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">性别</label>
                <select
                  value={editForm.gender}
                  onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                >
                  <option value="">请选择性别</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">手机号码</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">所属部门</label>
                <div className="flex gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] truncate">
                    {editDeptName || <span className="text-[#86868b]">未设置部门</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditDeptSelectOpen(true)}
                    className="px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all text-[14px] text-[#1d1d1f] whitespace-nowrap"
                  >
                    选择
                  </button>
                  {editDeptId && (
                    <button
                      type="button"
                      onClick={() => { setEditDeptId(null); setEditDeptName(''); }}
                      className="px-3 py-2.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all text-[14px] text-[#86868b]"
                    >
                      <X className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-[#d2d2d7] px-6 py-4 flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">
                  取消
                </button>
              </Dialog.Close>
              <button
                onClick={handleEditSubmit}
                disabled={editSubmitting}
                className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-lg transition-all text-[14px] font-medium"
              >
                {editSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Department Selection Dialog for Edit */}
      <Dialog.Root open={editDeptSelectOpen} onOpenChange={setEditDeptSelectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-md max-h-[70vh] overflow-hidden z-50">
            <div className="bg-white border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">选择部门</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(70vh-80px)]">
              {renderDepartmentTreeForEdit(departments)}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Department Selection Dialog for Add */}
      <Dialog.Root open={deptSelectDialogOpen} onOpenChange={setDeptSelectDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-md max-h-[70vh] overflow-hidden z-50">
            <div className="bg-white border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">选择部门</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(70vh-80px)]">
              {renderDepartmentTree(departments)}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
