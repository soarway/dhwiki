import { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Lightbulb, Building2, Check, ChevronDown, Users, Search } from 'lucide-react';

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

interface NewKnowledgeBaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  dirTag?: string | null;
}

type KbType = 'single' | 'multi' | 'private' | 'users';

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

const KB_TYPE_OPTIONS: { value: KbType; label: string; hint: string }[] = [
  { value: 'single',  label: '单部门知识库',   hint: '仅指定部门及其下级部门可查看' },
  { value: 'multi',   label: '多部门知识库',   hint: '指定的多个部门均可查看' },
  { value: 'users',   label: '跨部门多人知识库', hint: '指定成员可查看，创建人拥有删除权限' },
  { value: 'private', label: '私密知识库',     hint: '仅创建者本人可查看' },
];

export function NewKnowledgeBaseDialog({ open, onOpenChange, onCreated, dirTag }: NewKnowledgeBaseDialogProps) {
  const [knowledgeBaseName, setKnowledgeBaseName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [kbType, setKbType] = useState<KbType>('single');
  const [showTypePicker, setShowTypePicker] = useState(false);

  const [deptTree, setDeptTree] = useState<DeptNode[]>([]);
  // single dept
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [selectedDeptName, setSelectedDeptName] = useState('');
  // multi dept
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<number>>(new Set());
  const [deptNameMap, setDeptNameMap] = useState<Map<number, string>>(new Map());
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  // users type
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [filterDeptId, setFilterDeptId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/departments/tree', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((tree: DeptNode[]) => {
        setDeptTree(tree);
        const map = new Map<number, string>();
        function collect(nodes: DeptNode[]) {
          for (const n of nodes) { map.set(n.id, n.name); collect(n.children); }
        }
        collect(tree);
        setDeptNameMap(map);
      })
      .catch(() => {});
    fetch('/api/users/selectable', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setAllUsers(d.items ?? []))
      .catch(() => {});
  }, [open]);

  const resetForm = () => {
    setKnowledgeBaseName('');
    setDescription('');
    setErrorMsg('');
    setKbType('single');
    setShowTypePicker(false);
    setSelectedDeptId(null);
    setSelectedDeptName('');
    setSelectedDeptIds(new Set());
    setShowDeptPicker(false);
    setSelectedUserIds(new Set());
    setShowUserPicker(false);
    setUserSearch('');
    setFilterDeptId(null);
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!knowledgeBaseName.trim()) { setErrorMsg('请输入知识库名称'); return; }
    if (kbType === 'single' && selectedDeptId === null) { setErrorMsg('请选择所属部门'); return; }
    if (kbType === 'multi' && selectedDeptIds.size === 0) { setErrorMsg('请至少选择一个部门'); return; }
    if (kbType === 'users' && selectedUserIds.size === 0) { setErrorMsg('请至少选择一名成员'); return; }

    setIsLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: knowledgeBaseName.trim(),
        description: description.trim() || undefined,
        is_default_visible: false,
        ...(dirTag ? { dir_tag: dirTag } : {}),
      };
      if (kbType === 'single') {
        body.dept_id = selectedDeptId;
      } else if (kbType === 'multi') {
        body.dept_ids = Array.from(selectedDeptIds);
      } else if (kbType === 'users') {
        body.user_ids = Array.from(selectedUserIds);
      }
      // private: no dept_id, is_default_visible stays false

      const res = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.detail || '创建失败，请重试'); return; }
      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch {
      setErrorMsg('网络错误，请检查连接后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) resetForm();
    onOpenChange(o);
  };

  const flatDepts = flattenTree(deptTree);
  const currentTypeLabel = KB_TYPE_OPTIONS.find(o => o.value === kbType)!.label;
  const currentTypeHint  = KB_TYPE_OPTIONS.find(o => o.value === kbType)!.hint;

  const multiDeptSummary = selectedDeptIds.size === 0
    ? '请选择部门'
    : Array.from(selectedDeptIds).map(id => deptNameMap.get(id) ?? id).join('、');

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return allUsers.filter(u => {
      const matchDept = filterDeptId === null || u.dept_ids.includes(filterDeptId);
      const matchSearch = !q || u.real_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
      return matchDept && matchSearch && u.status;
    });
  }, [allUsers, userSearch, filterDeptId]);

  return (
    <>
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-6 w-full max-w-lg z-50">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-[17px] font-semibold text-[#1d1d1f]">
              新建知识库
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                <X className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-5">
            {errorMsg && errorMsg !== '请输入知识库名称' && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[14px] text-red-600">
                {errorMsg}
              </div>
            )}

            {/* Icon + Name */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-8 h-8 text-[#0071e3]" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">知识库名称:</label>
                <input
                  type="text"
                  value={knowledgeBaseName}
                  onChange={e => { setKnowledgeBaseName(e.target.value); if (errorMsg === '请输入知识库名称') setErrorMsg(''); }}
                  placeholder="请输入知识库名称"
                  className={`w-full px-4 py-2.5 bg-white rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all text-[14px] text-[#1d1d1f] ${errorMsg === '请输入知识库名称' ? 'border-red-400 focus:border-red-400' : 'border-[#d2d2d7] focus:border-[#0071e3]'}`}
                />
                {errorMsg === '请输入知识库名称' && (
                  <p className="mt-1.5 text-[12px] text-red-500">请输入知识库名称</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">知识库简介:</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="请输入知识库简介（选填）"
                className="w-full px-4 py-2.5 bg-white rounded-lg border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[14px] text-[#1d1d1f] resize-none"
                rows={3}
              />
            </div>

            {/* KB Type selector */}
            <div>
              <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">知识库类型</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTypePicker(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-[#d2d2d7] rounded-lg text-[14px] text-[#1d1d1f] hover:border-[#0071e3] transition-colors"
                >
                  <span>{currentTypeLabel}</span>
                  <ChevronDown className={`w-4 h-4 text-[#86868b] transition-transform ${showTypePicker ? 'rotate-180' : ''}`} strokeWidth={1.5} />
                </button>
                {showTypePicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#d2d2d7] rounded-xl shadow-lg z-10 overflow-hidden">
                    {KB_TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setKbType(opt.value);
                          setShowTypePicker(false);
                          setShowDeptPicker(false);
                          setSelectedDeptId(null);
                          setSelectedDeptName('');
                          setSelectedDeptIds(new Set());
                          setSelectedUserIds(new Set());
                          setShowUserPicker(false);
                          setUserSearch('');
                          setFilterDeptId(null);
                          setErrorMsg('');
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#f5f5f7] transition-colors text-left"
                      >
                        <span className="text-[14px] text-[#1d1d1f]">{opt.label}</span>
                        {kbType === opt.value && <Check className="w-4 h-4 text-[#0071e3]" strokeWidth={2} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[12px] text-[#86868b] mt-1.5">{currentTypeHint}</p>
            </div>

            {/* Department Picker — single */}
            {kbType === 'single' && (
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">所属部门</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 text-[#86868b] flex-shrink-0" strokeWidth={1.5} />
                    <span className={`truncate ${selectedDeptId === null ? 'text-[#86868b]' : 'text-[#1d1d1f]'}`}>
                      {selectedDeptId === null ? '请选择部门' : selectedDeptName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeptPicker(v => !v)}
                    className="px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[14px] font-medium transition-all flex-shrink-0"
                  >
                    选择
                  </button>
                </div>
                {showDeptPicker && (
                  <div className="mt-2 bg-white border border-[#d2d2d7] rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {flatDepts.map(({ node, depth }) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => { setSelectedDeptId(node.id); setSelectedDeptName(node.name); setShowDeptPicker(false); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#f5f5f7] transition-colors text-left"
                        style={{ paddingLeft: `${16 + depth * 20}px` }}
                      >
                        <span className="text-[14px] text-[#1d1d1f]">{node.name}</span>
                        {selectedDeptId === node.id && <Check className="w-4 h-4 text-[#0071e3]" strokeWidth={2} />}
                      </button>
                    ))}
                    {flatDepts.length === 0 && <p className="px-4 py-3 text-[13px] text-[#86868b]">暂无部门数据</p>}
                  </div>
                )}
                <p className="text-[12px] text-[#0071e3] mt-1.5">选择后，该部门及下级部门拥有查看权限</p>
              </div>
            )}

            {/* Department Picker — multi */}
            {kbType === 'multi' && (
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">所属部门（可多选）</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-[#f5f5f7] rounded-lg border border-[#d2d2d7] text-[14px] flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 text-[#86868b] flex-shrink-0" strokeWidth={1.5} />
                    <span className={`truncate ${selectedDeptIds.size === 0 ? 'text-[#86868b]' : 'text-[#1d1d1f]'}`}>
                      {multiDeptSummary}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeptPicker(v => !v)}
                    className="px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[14px] font-medium transition-all flex-shrink-0"
                  >
                    选择
                  </button>
                </div>
                {showDeptPicker && (
                  <div className="mt-2 bg-white border border-[#d2d2d7] rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {flatDepts.map(({ node, depth }) => {
                      const checked = selectedDeptIds.has(node.id);
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => {
                            setSelectedDeptIds(prev => {
                              const next = new Set(prev);
                              if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                              return next;
                            });
                          }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#f5f5f7] transition-colors text-left"
                          style={{ paddingLeft: `${16 + depth * 20}px` }}
                        >
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
                <p className="text-[12px] text-[#0071e3] mt-1.5">已选 {selectedDeptIds.size} 个部门，各部门及其下级部门均可查看</p>
              </div>
            )}

            {/* User Picker — users type */}
            {kbType === 'users' && (
              <div>
                <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">
                  成员设置
                  <span className="ml-2 text-[12px] font-normal text-[#86868b]">创建人自动获得管理权限</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowUserPicker(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[14px] font-medium transition-all"
                >
                  <Users className="w-4 h-4" strokeWidth={1.5} />
                  选择成员{selectedUserIds.size > 0 ? `（已选 ${selectedUserIds.size} 人）` : ''}
                </button>
                {selectedUserIds.size > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {Array.from(selectedUserIds).map(uid => {
                      const u = allUsers.find(x => x.id === uid);
                      if (!u) return null;
                      return (
                        <span key={uid} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0071e3]/10 text-[#0071e3] rounded-full text-[12px]">
                          {u.real_name || u.username}
                          <button
                            type="button"
                            onClick={() => setSelectedUserIds(prev => { const n = new Set(prev); n.delete(uid); return n; })}
                            className="hover:text-[#005bb5]"
                          >
                            <X className="w-3 h-3" strokeWidth={2} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-[#1d1d1f] rounded-lg transition-all text-[14px] font-medium">
                  取消
                </button>
              </Dialog.Close>
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-all text-[14px] font-medium"
              >
                {isLoading ? '创建中...' : '新建知识库'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>

    {/* User picker modal */}
    <Dialog.Root open={showUserPicker} onOpenChange={setShowUserPicker}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] w-[520px] max-w-[95vw] z-[70] flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#d2d2d7] flex-shrink-0">
            <Dialog.Title className="text-[15px] font-semibold text-[#1d1d1f]">选择成员</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                <X className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>

          {/* Search + dept filter */}
          <div className="px-4 py-3 border-b border-[#d2d2d7] flex-shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="搜索姓名或用户名"
                className="w-full pl-9 pr-4 py-2 border border-[#d2d2d7] rounded-lg text-[13px] text-[#1d1d1f] outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]/20"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setFilterDeptId(null)}
                className={`px-2.5 py-1 rounded-full text-[12px] transition-colors ${filterDeptId === null ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'}`}
              >全部</button>
              {flatDepts.map(({ node }) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setFilterDeptId(node.id)}
                  className={`px-2.5 py-1 rounded-full text-[12px] transition-colors ${filterDeptId === node.id ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'}`}
                >{node.name}</button>
              ))}
            </div>
          </div>

          {/* User list */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-[13px] text-[#86868b] py-8">暂无匹配用户</p>
            ) : filteredUsers.map(u => {
              const checked = selectedUserIds.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUserIds(prev => {
                    const n = new Set(prev);
                    if (n.has(u.id)) n.delete(u.id); else n.add(u.id);
                    return n;
                  })}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[#f5f5f7] transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-[#0071e3] border-[#0071e3]' : 'border-[#d2d2d7]'}`}>
                    {checked && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0 text-[13px] font-medium text-[#0071e3]">
                    {(u.real_name || u.username).charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-[#1d1d1f] font-medium truncate">{u.real_name || u.username}</p>
                    <p className="text-[12px] text-[#86868b] truncate">{u.dept_names.join('、') || '暂无部门'}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#d2d2d7] flex-shrink-0">
            <span className="text-[13px] text-[#86868b]">已选 {selectedUserIds.size} 人</span>
            <button
              type="button"
              onClick={() => setShowUserPicker(false)}
              className="px-5 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[14px] font-medium transition-colors"
            >确定</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  );
}
