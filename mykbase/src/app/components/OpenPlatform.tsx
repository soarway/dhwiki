import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, Key, BookOpen, RefreshCw, Globe, Clock } from 'lucide-react';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface KbItem {
  id: number;
  name: string;
}

interface ApiKey {
  id: number;
  name: string;
  key_preview: string;
  is_active: boolean;
  allowed_kb_ids: number[] | null;
  rate_limit_per_min: number;
  created_at: string;
  last_used_at: string | null;
}

interface NewKeyFull {
  id: number;
  name: string;
  key: string;
  allowed_kb_ids: number[] | null;
  rate_limit_per_min: number;
  created_at: string;
}

export function OpenPlatform() {
  const [tab, setTab] = useState<'keys' | 'docs'>('keys');
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [kbs, setKbs] = useState<KbItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRateLimit, setNewRateLimit] = useState(60);
  const [newKbIds, setNewKbIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<NewKeyFull | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editRateLimit, setEditRateLimit] = useState(60);
  const [editKbIds, setEditKbIds] = useState<number[]>([]);
  const [editClearKb, setEditClearKb] = useState(false);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/api-keys', { headers: authHeaders() });
      if (res.ok) setKeys(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const loadKbs = async () => {
    const res = await fetch('/api/knowledge-bases', { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setKbs((data.items || data).map((k: any) => ({ id: k.id, name: k.name })));
    }
  };

  useEffect(() => {
    loadKeys();
    loadKbs();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: newName.trim(),
          rate_limit_per_min: newRateLimit,
          allowed_kb_ids: newKbIds.length > 0 ? newKbIds : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKeyResult(data);
        setNewName('');
        setNewRateLimit(60);
        setNewKbIds([]);
        setShowCreate(false);
        loadKeys();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此 API Key？删除后无法恢复，使用此 Key 的第三方系统将立即失效。')) return;
    await fetch(`/api/api-keys/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadKeys();
  };

  const handleSaveEdit = async (id: number) => {
    await fetch(`/api/api-keys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        rate_limit_per_min: editRateLimit,
        allowed_kb_ids: editClearKb ? null : (editKbIds.length > 0 ? editKbIds : null),
        clear_kb_restriction: editClearKb,
      }),
    });
    setEditId(null);
    loadKeys();
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const kbName = (id: number) => kbs.find(k => k.id === id)?.name ?? `KB#${id}`;

  const toggleKbId = (id: number, arr: number[], setter: (v: number[]) => void) => {
    setter(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  };

  return (
    <div className="flex-1 overflow-auto bg-[#f5f5f7] p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[28px] font-bold text-[#1d1d1f] mb-2">开放平台</h1>
          <p className="text-[15px] text-[#86868b]">管理 API Key，将知识库 AI 问答能力开放给 ERP、OA 等第三方系统。</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#e5e5ea] rounded-xl p-1 mb-6 w-fit">
          {([['keys', <Key className="w-4 h-4" strokeWidth={1.5} />, 'API Key 管理'],
             ['docs', <BookOpen className="w-4 h-4" strokeWidth={1.5} />, '开发者文档']] as const).map(([k, icon, label]) => (
            <button key={k}
              onClick={() => setTab(k as 'keys' | 'docs')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                tab === k ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Tab: API Key 管理 ── */}
        {tab === 'keys' && (
          <div className="space-y-4">
            {/* Newly created key — show once */}
            {newKeyResult && (
              <div className="bg-[#f0fdf4] border border-[#34c759]/30 rounded-2xl p-5">
                <p className="text-[13px] font-semibold text-[#1d8a38] mb-2">
                  API Key 创建成功！请立即复制并妥善保存，此后将不再显示完整密钥。
                </p>
                <div className="flex items-center gap-3 bg-white rounded-lg px-4 py-2.5 border border-[#d2d2d7]">
                  <code className="flex-1 text-[13px] font-mono break-all text-[#1d1d1f]">{newKeyResult.key}</code>
                  <button onClick={() => copyKey(newKeyResult.key)}
                    className="flex-shrink-0 flex items-center gap-1 text-[13px] text-[#0071e3] hover:opacity-70 transition-opacity">
                    {copied ? <Check className="w-4 h-4 text-[#34c759]" /> : <Copy className="w-4 h-4" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <button onClick={() => setNewKeyResult(null)}
                  className="mt-3 text-[12px] text-[#86868b] hover:text-[#1d1d1f]">关闭</button>
              </div>
            )}

            {/* Create form */}
            {showCreate ? (
              <div className="bg-white rounded-2xl border border-[#d2d2d7] p-6">
                <h2 className="text-[16px] font-semibold text-[#1d1d1f] mb-4">新建 API Key</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-medium text-[#1d1d1f] mb-1.5">Key 名称 <span className="text-red-500">*</span></label>
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="例：ERP系统集成"
                      className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3]" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-[#1d1d1f] mb-1">每分钟调用上限</label>
                    <p className="text-[12px] text-[#86868b] mb-1.5">超过此限制返回 429，保护服务稳定性</p>
                    <input type="number" min={1} max={1000} value={newRateLimit}
                      onChange={e => setNewRateLimit(Number(e.target.value))}
                      className="w-32 px-3 py-2 border border-[#d2d2d7] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3]" />
                    <span className="ml-2 text-[13px] text-[#86868b]">次/分钟</span>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-[#1d1d1f] mb-1">知识库访问范围</label>
                    <p className="text-[12px] text-[#86868b] mb-2">不选则允许访问全部知识库</p>
                    <div className="flex flex-wrap gap-2">
                      {kbs.map(kb => (
                        <button key={kb.id}
                          onClick={() => toggleKbId(kb.id, newKbIds, setNewKbIds)}
                          className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                            newKbIds.includes(kb.id)
                              ? 'bg-[#0071e3] text-white border-[#0071e3]'
                              : 'bg-white text-[#1d1d1f] border-[#d2d2d7] hover:border-[#0071e3]'
                          }`}>
                          {kb.name}
                        </button>
                      ))}
                      {kbs.length === 0 && <span className="text-[12px] text-[#86868b]">暂无知识库</span>}
                    </div>
                    {newKbIds.length > 0 && (
                      <p className="mt-1.5 text-[12px] text-[#0071e3]">已选：{newKbIds.map(kbName).join('、')}</p>
                    )}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={handleCreate} disabled={creating || !newName.trim()}
                      className="px-5 py-2 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white rounded-lg text-[14px] font-medium transition-colors">
                      {creating ? '创建中...' : '创建'}
                    </button>
                    <button onClick={() => { setShowCreate(false); setNewName(''); setNewKbIds([]); setNewRateLimit(60); }}
                      className="px-5 py-2 border border-[#d2d2d7] rounded-lg text-[14px] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors">
                      取消
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl text-[14px] font-medium transition-colors">
                <Plus className="w-4 h-4" strokeWidth={2} />新建 API Key
              </button>
            )}

            {/* Keys list */}
            <div className="bg-white rounded-2xl border border-[#d2d2d7] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f5]">
                <span className="text-[15px] font-semibold text-[#1d1d1f]">我的 API Key</span>
                <button onClick={loadKeys} className="p-1.5 hover:bg-[#f5f5f7] rounded-lg transition-colors">
                  <RefreshCw className="w-4 h-4 text-[#86868b]" strokeWidth={1.5} />
                </button>
              </div>

              {loading ? (
                <div className="py-12 text-center text-[14px] text-[#86868b]">加载中...</div>
              ) : keys.length === 0 ? (
                <div className="py-12 text-center text-[14px] text-[#86868b]">暂无 API Key，点击上方按钮新建</div>
              ) : (
                <div className="divide-y divide-[#f0f0f5]">
                  {keys.map(k => (
                    <div key={k.id} className="px-6 py-4">
                      {editId === k.id ? (
                        /* Edit mode */
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-[#1d1d1f]">{k.name}</span>
                            <code className="text-[12px] text-[#86868b] font-mono">{k.key_preview}</code>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="text-[13px] text-[#1d1d1f] whitespace-nowrap">每分钟上限</label>
                            <input type="number" min={1} max={1000} value={editRateLimit}
                              onChange={e => setEditRateLimit(Number(e.target.value))}
                              className="w-24 px-2 py-1 border border-[#d2d2d7] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30" />
                            <span className="text-[12px] text-[#86868b]">次/分钟</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <label className="text-[13px] text-[#1d1d1f]">知识库范围</label>
                              <label className="flex items-center gap-1 text-[12px] text-[#86868b] cursor-pointer">
                                <input type="checkbox" checked={editClearKb}
                                  onChange={e => { setEditClearKb(e.target.checked); if (e.target.checked) setEditKbIds([]); }} />
                                全部知识库（不限制）
                              </label>
                            </div>
                            {!editClearKb && (
                              <div className="flex flex-wrap gap-2">
                                {kbs.map(kb => (
                                  <button key={kb.id}
                                    onClick={() => toggleKbId(kb.id, editKbIds, setEditKbIds)}
                                    className={`px-3 py-0.5 rounded-full text-[12px] font-medium border transition-colors ${
                                      editKbIds.includes(kb.id)
                                        ? 'bg-[#0071e3] text-white border-[#0071e3]'
                                        : 'bg-white text-[#1d1d1f] border-[#d2d2d7] hover:border-[#0071e3]'
                                    }`}>{kb.name}</button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => handleSaveEdit(k.id)}
                              className="px-4 py-1.5 bg-[#0071e3] text-white rounded-lg text-[13px] font-medium">保存</button>
                            <button onClick={() => setEditId(null)}
                              className="px-4 py-1.5 border border-[#d2d2d7] rounded-lg text-[13px] text-[#1d1d1f] hover:bg-[#f5f5f7]">取消</button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[14px] font-semibold text-[#1d1d1f]">{k.name}</span>
                              <code className="text-[12px] text-[#86868b] font-mono bg-[#f5f5f7] px-2 py-0.5 rounded">{k.key_preview}</code>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                k.is_active ? 'bg-[#f0fdf4] text-[#1d8a38]' : 'bg-[#fff0f0] text-[#ff3b30]'
                              }`}>{k.is_active ? '启用' : '停用'}</span>
                            </div>
                            <div className="flex items-center gap-4 text-[12px] text-[#86868b]">
                              <span className="flex items-center gap-1">
                                <Globe className="w-3 h-3" strokeWidth={1.5} />
                                {k.allowed_kb_ids && k.allowed_kb_ids.length > 0
                                  ? k.allowed_kb_ids.map(kbName).join('、')
                                  : '全部知识库'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" strokeWidth={1.5} />
                                {k.rate_limit_per_min} 次/分钟
                              </span>
                              {k.last_used_at && (
                                <span>最近使用：{new Date(k.last_used_at).toLocaleDateString('zh-CN')}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                setEditId(k.id);
                                setEditRateLimit(k.rate_limit_per_min);
                                setEditKbIds(k.allowed_kb_ids ?? []);
                                setEditClearKb(!k.allowed_kb_ids || k.allowed_kb_ids.length === 0);
                              }}
                              className="px-3 py-1.5 text-[13px] border border-[#d2d2d7] rounded-lg hover:bg-[#f5f5f7] transition-colors text-[#1d1d1f]">
                              编辑
                            </button>
                            <button onClick={() => handleDelete(k.id)}
                              className="p-1.5 text-[#ff3b30] hover:bg-[#fff0f0] rounded-lg transition-colors">
                              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Usage tips */}
            <div className="bg-white rounded-2xl border border-[#d2d2d7] p-6">
              <h3 className="text-[14px] font-semibold text-[#1d1d1f] mb-3">快速接入示例</h3>
              <p className="text-[12px] text-[#86868b] mb-2">在第三方系统中，使用以下方式调用知识库问答接口：</p>
              <pre className="bg-[#1d1d1f] text-[#f5f5f7] rounded-lg p-4 text-[12px] font-mono overflow-x-auto">{`curl -X POST /api/open/v1/ask \\
  -H "X-API-Key: your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"报销流程是什么？","kb_id":1}'`}</pre>
              <button onClick={() => setTab('docs')}
                className="mt-3 text-[13px] text-[#0071e3] hover:underline">
                查看完整开发者文档 →
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: 开发者文档 ── */}
        {tab === 'docs' && (
          <div className="bg-white rounded-2xl border border-[#d2d2d7] overflow-hidden" style={{ height: 'calc(100vh - 240px)' }}>
            <iframe
              src="/api/open/docs"
              className="w-full h-full border-none"
              title="开放平台开发者文档"
            />
          </div>
        )}
      </div>
    </div>
  );
}
