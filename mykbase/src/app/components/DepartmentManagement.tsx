import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Plus, Search, Building2, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface Department {
  id: number;
  name: string;
  parent_id: number | null;
  manager_user_id: number | null;
  manager_user_name: string | null;
  children?: Department[];
  expanded?: boolean;
}

interface UserOption {
  id: number;
  username: string;
  real_name: string;
  is_frozen: boolean;
  status: boolean;
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

export function DepartmentManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [addRootDialogOpen, setAddRootDialogOpen] = useState(false);
  const [addChildDialogOpen, setAddChildDialogOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Manager selection
  const [managerUserId, setManagerUserId] = useState<number | null>(null);
  const [managerUserName, setManagerUserName] = useState('');
  const [managerSelectOpen, setManagerSelectOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [managerSearch, setManagerSearch] = useState('');

  const loadTree = useCallback(async () => {
    const res = await fetch('/api/departments/tree', { headers: getAuthHeaders() });
    if (res.ok) {
      const data: Department[] = await res.json();
      setDepartments(addExpandedFlag(data));
    }
  }, []);

  useEffect(() => {
    loadTree();
    fetch('/api/users?skip=0&limit=10000', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setAllUsers((data.items ?? []).map((u: any) => ({
        id: u.id, username: u.username, real_name: u.real_name,
        is_frozen: u.is_frozen, status: u.status,
      }))))
      .catch(() => {});
  }, [loadTree]);

  useEffect(() => {
    setEditName(selectedDept?.name ?? '');
    setManagerUserId(selectedDept?.manager_user_id ?? null);
    setManagerUserName(selectedDept?.manager_user_name ?? '');
    setSaveError('');
  }, [selectedDept?.id]);

  const toggleExpand = (deptId: number) => {
    const updateExpanded = (depts: Department[]): Department[] => {
      return depts.map((dept) => {
        if (dept.id === deptId) {
          return { ...dept, expanded: !dept.expanded };
        }
        if (dept.children) {
          return { ...dept, children: updateExpanded(dept.children) };
        }
        return dept;
      });
    };
    setDepartments(updateExpanded(departments));
  };

  const renderDepartmentTree = (depts: Department[], level: number = 0) => {
    return depts.map((dept) => (
      <div key={dept.id}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
            selectedDept?.id === dept.id
              ? 'bg-[#0071e3] text-white'
              : 'hover:bg-[#0071e3]/10 text-[#1d1d1f]'
          }`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => setSelectedDept(dept)}
        >
          {dept.children && dept.children.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(dept.id);
              }}
              className="p-0.5"
            >
              {dept.expanded ? (
                <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
              )}
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

  const getAllDepartments = (depts: Department[]): Department[] => {
    let result: Department[] = [];
    depts.forEach((dept) => {
      result.push(dept);
      if (dept.children) {
        result = result.concat(getAllDepartments(dept.children));
      }
    });
    return result;
  };

  const getParentDepartmentName = (parentId: number | null): string => {
    if (!parentId) return '无';
    const allDepts = getAllDepartments(departments);
    const parentDept = allDepts.find((dept) => dept.id === parentId);
    return parentDept ? parentDept.name : '无';
  };

  const handleAddRootDept = () => {
    setNewDeptName('');
    setErrorMsg('');
    setAddRootDialogOpen(true);
  };

  const handleAddChildDept = () => {
    if (!selectedDept) {
      alert('请先选择一个部门');
      return;
    }
    setNewDeptName('');
    setErrorMsg('');
    setAddChildDialogOpen(true);
  };

  const handleSaveDept = async () => {
    if (!selectedDept) return;
    if (!editName.trim()) {
      setSaveError('部门名称不能为空');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const body: Record<string, unknown> = { name: editName.trim() };
      // Always send manager_user_id so it can be cleared (null) or set
      body.manager_user_id = managerUserId;
      const res = await fetch(`/api/departments/${selectedDept.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail ?? '保存失败，请重试');
        return;
      }
      await loadTree();
      setSelectedDept((prev) => prev ? {
        ...prev,
        name: editName.trim(),
        manager_user_id: managerUserId,
        manager_user_name: managerUserName || null,
      } : prev);
    } catch {
      setSaveError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(selectedDept?.name ?? '');
    setManagerUserId(selectedDept?.manager_user_id ?? null);
    setManagerUserName(selectedDept?.manager_user_name ?? '');
    setSaveError('');
  };

  const submitNewDept = async (isRoot: boolean) => {
    if (!newDeptName.trim()) {
      setErrorMsg('请填写部门名称');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const body = {
        name: newDeptName.trim(),
        parent_id: isRoot ? null : (selectedDept?.id ?? null),
      };
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.detail ?? '创建失败，请重试');
        return;
      }
      if (isRoot) {
        setAddRootDialogOpen(false);
      } else {
        setAddChildDialogOpen(false);
      }
      await loadTree();
    } catch {
      setErrorMsg('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="size-full flex bg-[#f5f5f7]">
      {/* Left Panel - Department Tree */}
      <div className="w-[55%] border-r border-[#d2d2d7] bg-[#fbfbfd] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#d2d2d7]">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-[#1d1d1f]" strokeWidth={1.5} />
            <h2 className="text-[17px] font-semibold text-[#1d1d1f]">组织结构</h2>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAddRootDept}
              className="flex-1 px-4 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg transition-all duration-150 flex items-center justify-center gap-2 text-[14px] font-medium"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              添加根部门
            </button>
            <button
              onClick={handleAddChildDept}
              className="flex-1 px-4 py-2 bg-white border border-[#d2d2d7] hover:bg-[#0071e3]/10 hover:border-[#0071e3]/30 text-[#1d1d1f] rounded-lg transition-all duration-150 flex items-center justify-center gap-2 text-[14px] font-medium"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              添加下级
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-[#d2d2d7]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="搜索部门..."
              className="w-full pl-10 pr-4 py-2 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
            />
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {departments.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[#86868b] text-[14px]">
              暂无部门数据
            </div>
          ) : (
            renderDepartmentTree(departments)
          )}
        </div>
      </div>

      {/* Right Panel - Department Details */}
      <div className="w-[45%] bg-white flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#d2d2d7]">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f]">部门信息</h2>
        </div>

        {/* Form */}
        {selectedDept ? (
          <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col">
            <div className="space-y-5 flex-1">
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">部门名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">上级部门</label>
                <input
                  type="text"
                  value={getParentDepartmentName(selectedDept.parent_id)}
                  readOnly
                  className="w-full px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">部门负责人</label>
                <div className="flex gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] truncate">
                    {managerUserName
                      ? <span className="text-[#1d1d1f]">{managerUserName}</span>
                      : <span className="text-[#86868b]">未设置</span>
                    }
                  </div>
                  <button
                    type="button"
                    onClick={() => { setManagerSearch(''); setManagerSelectOpen(true); }}
                    className="px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all text-[14px] text-[#1d1d1f] whitespace-nowrap"
                  >
                    选择
                  </button>
                  {managerUserId && (
                    <button
                      type="button"
                      onClick={() => { setManagerUserId(null); setManagerUserName(''); }}
                      className="px-3 py-2.5 bg-white rounded-lg border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all"
                    >
                      <X className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {saveError && (
              <p className="text-[13px] text-red-500 mt-4">{saveError}</p>
            )}

            <div className="flex gap-3 pt-6">
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium"
              >
                取消
              </button>
              <button
                onClick={handleSaveDept}
                disabled={saving || (editName.trim() === selectedDept.name && managerUserId === selectedDept.manager_user_id)}
                className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all text-[14px] font-medium"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#86868b] text-[14px]">
            请选择一个部门查看详情
          </div>
        )}
      </div>

      {/* Add Root Department Dialog */}
      <Dialog.Root open={addRootDialogOpen} onOpenChange={setAddRootDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f] mb-4">
              添加根部门
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">部门名称</label>
                <input
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="请输入部门名称"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                  onKeyDown={(e) => e.key === 'Enter' && submitNewDept(true)}
                />
              </div>

              {errorMsg && (
                <p className="text-[13px] text-red-500">{errorMsg}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">
                    取消
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => submitNewDept(true)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-lg transition-all text-[14px] font-medium"
                >
                  {submitting ? '创建中...' : '确定'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Select Manager Dialog */}
      <Dialog.Root open={managerSelectOpen} onOpenChange={setManagerSelectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg max-h-[80vh] overflow-hidden z-50">
            <div className="border-b border-[#d2d2d7] px-6 py-4 flex items-center justify-between">
              <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">选择部门负责人</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                  <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </Dialog.Close>
            </div>
            <div className="px-4 py-3 border-b border-[#d2d2d7]/50 bg-[#fbfbfd]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                <input
                  type="text"
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                  placeholder="搜索用户姓名或账号..."
                  className="w-full pl-10 pr-4 py-2 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-160px)]">
              {allUsers
                .filter(u => !managerSearch ||
                  u.real_name.toLowerCase().includes(managerSearch.toLowerCase()) ||
                  u.username.toLowerCase().includes(managerSearch.toLowerCase())
                )
                .map(u => (
                  <div
                    key={u.id}
                    onClick={() => {
                      setManagerUserId(u.id);
                      setManagerUserName(u.real_name || u.username);
                      setManagerSelectOpen(false);
                    }}
                    className={`flex items-center gap-4 px-6 py-3 cursor-pointer transition-colors border-b border-[#d2d2d7]/40 ${managerUserId === u.id ? 'bg-[#0071e3]/10' : 'hover:bg-[#f5f5f7]'}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#1d1d1f] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[13px] font-medium">{(u.real_name || u.username)[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-[#1d1d1f]">{u.real_name}</div>
                      <div className="text-[12px] text-[#86868b]">@{u.username}</div>
                    </div>
                    <span className={`text-[12px] px-2 py-0.5 rounded-full font-medium ${u.is_frozen ? 'bg-blue-50 text-blue-700' : u.status ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {u.is_frozen ? '冻结' : u.status ? '正常' : '禁用'}
                    </span>
                  </div>
                ))
              }
              {allUsers.filter(u => !managerSearch ||
                u.real_name.toLowerCase().includes(managerSearch.toLowerCase()) ||
                u.username.toLowerCase().includes(managerSearch.toLowerCase())
              ).length === 0 && (
                <div className="px-6 py-10 text-center text-[14px] text-[#86868b]">暂无匹配用户</div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add Child Department Dialog */}
      <Dialog.Root open={addChildDialogOpen} onOpenChange={setAddChildDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f] mb-4">
              添加下级部门
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">上级部门</label>
                <input
                  type="text"
                  value={selectedDept?.name ?? ''}
                  readOnly
                  className="w-full px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">部门名称</label>
                <input
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="请输入部门名称"
                  className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f]"
                  onKeyDown={(e) => e.key === 'Enter' && submitNewDept(false)}
                />
              </div>

              {errorMsg && (
                <p className="text-[13px] text-red-500">{errorMsg}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">
                    取消
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => submitNewDept(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-lg transition-all text-[14px] font-medium"
                >
                  {submitting ? '创建中...' : '确定'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
