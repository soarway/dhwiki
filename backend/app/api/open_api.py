# backend/app/api/open_api.py
"""
企业知识库 开放平台 API  v1
认证方式：X-API-Key: <your_key>
"""
import hashlib
import json
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File as FastAPIFile, status
from fastapi.responses import FileResponse as FSFileResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_api_key_obj
from app.crud.conversation import create_conversation, get_conversation
from app.crud.file import get_files_by_folder, create_file
from app.models.file import File, ProcessStatus
from app.models.knowledge_base import KnowledgeBase
from app.models.user import User
from app.models.analytics import QueryLog
from app.services.rag.pipeline import ask

router = APIRouter()


# ── 请求 / 响应 Schema ──────────────────────────────────────────

class OpenAskRequest(BaseModel):
    question: str
    kb_id: Optional[int] = None          # 指定知识库（推荐）
    conversation_id: Optional[int] = None  # 多轮对话：传入上次返回的 conversation_id


class SourceItem(BaseModel):
    doc_name: str
    chunk_content: str
    page: Optional[int] = None


class OpenAskResponse(BaseModel):
    answer: str
    sources: list[SourceItem]
    response_ms: int
    conversation_id: int
    kb_id: Optional[int]


class UsageItem(BaseModel):
    date: str
    count: int


class UsageResponse(BaseModel):
    key_name: str
    total_calls: int
    daily: list[UsageItem]


# ── 工具函数 ─────────────────────────────────────────────────────

def _check_kb_access(key_obj, kb_id: Optional[int]) -> None:
    """如果 Key 有 KB 范围限制，校验 kb_id 是否在允许列表内。"""
    if not key_obj.allowed_kb_ids:
        return  # 无限制
    if kb_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="此 API Key 已限定知识库范围，请求时必须指定 kb_id",
        )
    try:
        allowed = json.loads(key_obj.allowed_kb_ids)
    except Exception:
        allowed = []
    if kb_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"此 API Key 无权访问知识库 {kb_id}",
        )


# ── 接口 ─────────────────────────────────────────────────────────

@router.post("/v1/ask", response_model=OpenAskResponse, summary="知识库问答（非流式）")
def open_ask(
    data: OpenAskRequest,
    db: Session = Depends(get_db),
    key_obj=Depends(get_api_key_obj),
):
    """
    ## 知识库问答接口

    发送一个问题，返回完整的 AI 回答。

    **认证**：`X-API-Key: <your_key>`

    **多轮对话**：首次调用无需传 `conversation_id`；后续调用传入上次响应中的
    `conversation_id` 即可保持上下文。

    **知识库范围**：建议指定 `kb_id`，否则在全局范围检索。
    """
    # 1. 校验 KB 访问权限
    _check_kb_access(key_obj, data.kb_id)

    # 2. 获取关联用户
    user = db.query(User).filter(
        User.id == key_obj.owner_id, User.status == True
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API Key 关联的用户已被禁用")

    # 3. 创建或复用会话
    if data.conversation_id:
        conv = get_conversation(db, data.conversation_id, user.id)
        if not conv:
            raise HTTPException(status_code=404, detail="会话不存在")
    else:
        conv = create_conversation(db, user.id, title=data.question[:50])

    # 4. 解析 doc_ids（按 kb_id 缩小范围）
    doc_ids: Optional[list[int]] = None
    if data.kb_id is not None:
        rows = db.query(File.id).filter(File.kb_id == data.kb_id).all()
        doc_ids = [r.id for r in rows]

    # 5. 调用 RAG 管道（非流式）
    result = ask(db, user, conv.id, data.question, doc_ids)

    sources = [
        SourceItem(
            doc_name=s.get("doc_name", ""),
            chunk_content=s.get("chunk_content", ""),
            page=s.get("page"),
        )
        for s in (result.get("sources") or [])
    ]

    return OpenAskResponse(
        answer=result["answer"],
        sources=sources,
        response_ms=result.get("response_ms", 0),
        conversation_id=conv.id,
        kb_id=data.kb_id,
    )


@router.get("/v1/usage", response_model=UsageResponse, summary="API Key 调用统计")
def open_usage(
    days: int = 7,
    db: Session = Depends(get_db),
    key_obj=Depends(get_api_key_obj),
):
    """
    ## 调用统计

    返回当前 API Key 所属用户最近 N 天的每日调用量（默认 7 天）。
    """
    days = min(max(days, 1), 90)
    since = datetime.utcnow() - timedelta(days=days)

    logs = (
        db.query(QueryLog)
        .filter(QueryLog.user_id == key_obj.owner_id, QueryLog.created_at >= since)
        .all()
    )

    daily: dict[str, int] = {}
    for log in logs:
        d = log.created_at.strftime("%Y-%m-%d")
        daily[d] = daily.get(d, 0) + 1

    total = sum(daily.values())
    daily_list = [UsageItem(date=d, count=c) for d, c in sorted(daily.items())]

    return UsageResponse(
        key_name=key_obj.name,
        total_calls=total,
        daily=daily_list,
    )


# ── 新增 Schema ───────────────────────────────────────────────────

class KbItem(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class OpenFileItem(BaseModel):
    id: int
    name: str
    file_type: str
    file_size: int
    process_status: str
    kb_folder_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class OpenFileListResponse(BaseModel):
    items: list[OpenFileItem]
    total: int
    page: int
    page_size: int


# ── 知识库列表 ─────────────────────────────────────────────────────

@router.get("/v1/kbs", response_model=list[KbItem], summary="查看知识库列表")
def open_list_kbs(
    db: Session = Depends(get_db),
    key_obj=Depends(get_api_key_obj),
):
    """
    ## 查看知识库列表

    返回当前 API Key 有权访问的所有知识库。

    若 Key 设置了知识库范围限制，则只返回允许的知识库；否则返回全部。
    """
    q = db.query(KnowledgeBase).filter(KnowledgeBase.is_deleted == False)
    if key_obj.allowed_kb_ids:
        try:
            allowed = json.loads(key_obj.allowed_kb_ids)
        except Exception:
            allowed = []
        q = q.filter(KnowledgeBase.id.in_(allowed))
    return q.order_by(KnowledgeBase.created_at.desc()).all()


# ── 文件列表 ───────────────────────────────────────────────────────

@router.get("/v1/kbs/{kb_id}/files", response_model=OpenFileListResponse, summary="查看知识库文件列表")
def open_list_files(
    kb_id: int,
    folder_id: Optional[int] = None,
    name: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    key_obj=Depends(get_api_key_obj),
):
    """
    ## 查看知识库文件列表

    返回指定知识库下的文件。

    - `folder_id`：指定子文件夹 ID，不传则返回根目录文件
    - `name`：按文件名模糊搜索（跨所有子目录）
    - `page` / `page_size`：分页，默认第 1 页每页 20 条
    """
    _check_kb_access(key_obj, kb_id)
    page_size = min(max(page_size, 1), 100)
    skip = (max(page, 1) - 1) * page_size
    items, total = get_files_by_folder(
        db, folder_id=folder_id, skip=skip, limit=page_size, kb_id=kb_id, name=name
    )
    return OpenFileListResponse(items=items, total=total, page=page, page_size=page_size)


# ── 文件下载 ───────────────────────────────────────────────────────

@router.get("/v1/files/{file_id}/download", summary="下载指定文件")
def open_download_file(
    file_id: int,
    db: Session = Depends(get_db),
    key_obj=Depends(get_api_key_obj),
):
    """
    ## 下载指定文件

    通过文件 ID 下载原始文件，响应为二进制流（`application/octet-stream`）。

    文件 ID 可从 **查看知识库文件列表** 接口中获取。
    """
    file_record = db.query(File).filter(File.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    _check_kb_access(key_obj, file_record.kb_id)
    if not os.path.exists(file_record.fs_path):
        raise HTTPException(status_code=404, detail="文件已被移动或删除")
    return FSFileResponse(
        path=file_record.fs_path,
        filename=file_record.name,
        media_type="application/octet-stream",
    )


# ── 文件上传 ───────────────────────────────────────────────────────

@router.post("/v1/kbs/{kb_id}/upload", response_model=OpenFileItem, status_code=201, summary="上传文件到知识库")
async def open_upload_file(
    kb_id: int,
    file: UploadFile = FastAPIFile(...),
    folder_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    key_obj=Depends(get_api_key_obj),
):
    """
    ## 上传文件到知识库

    以 `multipart/form-data` 格式上传文件，文件将自动进入处理队列（文本提取、向量化入库）。

    | 字段 | 类型 | 说明 |
    |------|------|------|
    | `file` | File* | 要上传的文件（必填） |
    | `folder_id` | integer | 目标文件夹 ID，不填则放到根目录 |

    处理完成（`process_status = "completed"`）后即可通过问答接口检索该文件内容。
    """
    _check_kb_access(key_obj, kb_id)

    # 获取 API Key 关联用户作为上传者
    user = db.query(User).filter(User.id == key_obj.owner_id).first()
    uploader_id = user.id if user else None

    os.makedirs(settings.upload_dir, exist_ok=True)
    content: bytes = await file.read()
    file_hash = hashlib.md5(content).hexdigest()
    ext = os.path.splitext(file.filename or "")[1].lstrip(".").lower() or "bin"
    dest_path = os.path.join(settings.upload_dir, f"{file_hash}.{ext}")
    with open(dest_path, "wb") as f:
        f.write(content)

    try:
        file_record = create_file(
            db,
            name=file.filename or "unknown",
            fs_path=dest_path,
            file_type=ext,
            file_size=len(content),
            file_hash=file_hash,
            kb_id=kb_id,
            kb_folder_id=folder_id,
            uploaded_by=uploader_id,
        )
    except IntegrityError:
        db.rollback()
        file_record = db.query(File).filter(File.fs_path == dest_path).first()
        if not file_record:
            raise HTTPException(status_code=500, detail="文件上传失败，请重试")
        file_record.name = file.filename or "unknown"
        file_record.kb_id = kb_id
        file_record.kb_folder_id = folder_id
        file_record.uploaded_by = uploader_id
        file_record.file_size = len(content)
        file_record.process_status = ProcessStatus.pending
        file_record.process_error = None
        file_record.chunk_count = 0
        db.commit()
        db.refresh(file_record)

    from app.tasks.process_document import process_document
    process_document.delay(file_record.id)
    return file_record


@router.get("/docs", response_class=HTMLResponse, include_in_schema=False)
def open_docs():
    """开发者文档页（HTML）"""
    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>企业知识库 · 开放平台文档</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f;background:#f5f5f7;line-height:1.6}
  .container{max-width:900px;margin:0 auto;padding:40px 24px}
  h1{font-size:32px;font-weight:700;margin-bottom:8px}
  h2{font-size:20px;font-weight:600;margin:40px 0 12px;padding-bottom:8px;border-bottom:1px solid #d2d2d7}
  h3{font-size:15px;font-weight:600;margin:20px 0 6px;color:#333}
  p{margin-bottom:12px;color:#444}
  .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;margin-right:8px}
  .post{background:#0071e3;color:#fff}
  .get{background:#34c759;color:#fff}
  .endpoint{background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:20px;border:1px solid #d2d2d7}
  .endpoint-title{font-size:15px;font-weight:600;font-family:monospace;margin-bottom:8px}
  pre{background:#1d1d1f;color:#f5f5f7;border-radius:10px;padding:16px 20px;font-size:13px;overflow-x:auto;margin:10px 0}
  code{font-family:'SF Mono',Consolas,monospace}
  .field{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px}
  .field:last-child{border:none}
  .fname{width:160px;font-weight:600;color:#1d1d1f;flex-shrink:0;font-family:monospace}
  .ftype{width:80px;color:#0071e3;flex-shrink:0}
  .fdesc{color:#555}
  .tip{background:#fff8e1;border-left:3px solid #f5a623;padding:10px 14px;border-radius:0 8px 8px 0;margin:12px 0;font-size:13px}
  .alert{background:#fff0f0;border-left:3px solid #ff3b30;padding:10px 14px;border-radius:0 8px 8px 0;margin:12px 0;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0}
  th{background:#f5f5f7;padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #d2d2d7}
  td{padding:8px 12px;border-bottom:1px solid #eee}
  .nav{background:#fff;border-bottom:1px solid #d2d2d7;padding:12px 24px;position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:24px}
  .nav-title{font-weight:700;font-size:15px}
  .nav-link{font-size:13px;color:#0071e3;text-decoration:none}
  .nav-link:hover{text-decoration:underline}
  .tag{display:inline-block;background:#e8f4fd;color:#0071e3;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:600}
</style>
</head>
<body>
<div class="nav">
  <span class="nav-title">企业知识库 · 开放平台</span>
  <a href="#auth" class="nav-link">认证</a>
  <a href="#endpoints" class="nav-link">接口</a>
  <a href="#errors" class="nav-link">错误码</a>
  <a href="#examples" class="nav-link">示例代码</a>
  <a href="#kb-endpoints" class="nav-link">知识库管理</a>
  <a href="/docs" class="nav-link" target="_blank">Swagger UI</a>
</div>
<div class="container">
  <h1>开放平台开发者文档</h1>
  <p>通过 HTTP API 将企业知识库的 AI 问答能力集成到任意第三方系统（ERP、OA、钉钉等）。</p>
  <p><strong>Base URL：</strong><code>/api/open</code>　　<strong>版本：</strong><span class="tag">v1</span></p>

  <h2 id="auth">认证</h2>
  <p>所有开放平台接口均通过 <strong>API Key</strong> 认证，在请求头中添加：</p>
  <pre><code>X-API-Key: your_api_key_here</code></pre>
  <div class="tip">API Key 由知识库管理员在系统后台 → 开放平台 → API Key 管理 中创建。每个 Key 可设置允许访问的知识库范围和每分钟调用上限。</div>
  <div class="alert">API Key 等同于用户凭据，请勿明文写入前端代码或提交到代码仓库，建议存放在服务端环境变量中。</div>

  <h2 id="endpoints">接口列表</h2>

  <!-- POST /open/v1/ask -->
  <div class="endpoint">
    <div class="endpoint-title"><span class="badge post">POST</span>/api/open/v1/ask</div>
    <p>知识库问答（非流式）。发送一个问题，等待 AI 检索相关文档并返回完整答案。</p>
    <h3>请求体（application/json）</h3>
    <div class="field"><span class="fname">question</span><span class="ftype">string*</span><span class="fdesc">用户问题，必填</span></div>
    <div class="field"><span class="fname">kb_id</span><span class="ftype">integer</span><span class="fdesc">指定知识库 ID。不填则在全局范围检索（受 Key 权限限制）</span></div>
    <div class="field"><span class="fname">conversation_id</span><span class="ftype">integer</span><span class="fdesc">多轮对话 ID。首次不填，后续传入上次响应的 conversation_id 保持上下文</span></div>
    <h3>响应体</h3>
    <div class="field"><span class="fname">answer</span><span class="ftype">string</span><span class="fdesc">AI 生成的回答（Markdown 格式）</span></div>
    <div class="field"><span class="fname">sources</span><span class="ftype">array</span><span class="fdesc">引用的文档片段列表，每项包含 doc_name、chunk_content、page</span></div>
    <div class="field"><span class="fname">response_ms</span><span class="ftype">integer</span><span class="fdesc">服务端处理耗时（毫秒）</span></div>
    <div class="field"><span class="fname">conversation_id</span><span class="ftype">integer</span><span class="fdesc">会话 ID，用于后续多轮对话</span></div>
    <div class="field"><span class="fname">kb_id</span><span class="ftype">integer</span><span class="fdesc">本次检索的知识库 ID</span></div>
    <h3>示例</h3>
<pre><code>curl -X POST /api/open/v1/ask \\
  -H "X-API-Key: your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"员工报销流程是什么？","kb_id":1}'</code></pre>
  </div>

  <!-- GET /open/v1/usage -->
  <div class="endpoint">
    <div class="endpoint-title"><span class="badge get">GET</span>/api/open/v1/usage</div>
    <p>查询当前 API Key 的调用统计，支持最近 1-90 天。</p>
    <h3>查询参数</h3>
    <div class="field"><span class="fname">days</span><span class="ftype">integer</span><span class="fdesc">统计天数，默认 7，最大 90</span></div>
    <h3>响应体</h3>
    <div class="field"><span class="fname">key_name</span><span class="ftype">string</span><span class="fdesc">API Key 名称</span></div>
    <div class="field"><span class="fname">total_calls</span><span class="ftype">integer</span><span class="fdesc">统计周期内总调用次数</span></div>
    <div class="field"><span class="fname">daily</span><span class="ftype">array</span><span class="fdesc">每日明细，每项含 date（YYYY-MM-DD）和 count</span></div>
  </div>

  <h2 id="kb-endpoints">知识库与文件管理</h2>

  <!-- GET /open/v1/kbs -->
  <div class="endpoint">
    <div class="endpoint-title"><span class="badge get">GET</span>/api/open/v1/kbs</div>
    <p>查看当前 API Key 有权访问的知识库列表。若 Key 设置了知识库范围限制则只返回允许的知识库，否则返回全部。</p>
    <h3>响应体（数组）</h3>
    <div class="field"><span class="fname">id</span><span class="ftype">integer</span><span class="fdesc">知识库 ID</span></div>
    <div class="field"><span class="fname">name</span><span class="ftype">string</span><span class="fdesc">知识库名称</span></div>
    <div class="field"><span class="fname">description</span><span class="ftype">string</span><span class="fdesc">知识库描述（可为空）</span></div>
    <div class="field"><span class="fname">created_at</span><span class="ftype">string</span><span class="fdesc">创建时间（ISO 8601）</span></div>
    <h3>示例</h3>
<pre><code>curl /api/open/v1/kbs -H "X-API-Key: your_key"</code></pre>
  </div>

  <!-- GET /open/v1/kbs/{kb_id}/files -->
  <div class="endpoint">
    <div class="endpoint-title"><span class="badge get">GET</span>/api/open/v1/kbs/{kb_id}/files</div>
    <p>查看指定知识库下的文件列表，支持按文件夹筛选、文件名模糊搜索及分页。</p>
    <h3>路径参数</h3>
    <div class="field"><span class="fname">kb_id</span><span class="ftype">integer*</span><span class="fdesc">知识库 ID</span></div>
    <h3>查询参数</h3>
    <div class="field"><span class="fname">folder_id</span><span class="ftype">integer</span><span class="fdesc">文件夹 ID，不传则返回根目录下的文件</span></div>
    <div class="field"><span class="fname">name</span><span class="ftype">string</span><span class="fdesc">文件名关键词（模糊匹配，跨所有子目录）</span></div>
    <div class="field"><span class="fname">page</span><span class="ftype">integer</span><span class="fdesc">页码，默认 1</span></div>
    <div class="field"><span class="fname">page_size</span><span class="ftype">integer</span><span class="fdesc">每页条数，默认 20，最大 100</span></div>
    <h3>响应体</h3>
    <div class="field"><span class="fname">items</span><span class="ftype">array</span><span class="fdesc">文件列表，每项含 id、name、file_type、file_size、process_status、kb_folder_id、created_at</span></div>
    <div class="field"><span class="fname">total</span><span class="ftype">integer</span><span class="fdesc">符合条件的总记录数</span></div>
    <div class="field"><span class="fname">page</span><span class="ftype">integer</span><span class="fdesc">当前页码</span></div>
    <div class="field"><span class="fname">page_size</span><span class="ftype">integer</span><span class="fdesc">每页条数</span></div>
    <div class="tip"><strong>process_status</strong> 字段值：<code>pending</code>（等待处理）/ <code>processing</code>（处理中）/ <code>completed</code>（已完成）/ <code>failed</code>（处理失败）。只有 <code>completed</code> 状态的文件内容才可被问答接口检索到。</div>
    <h3>示例</h3>
<pre><code>curl "/api/open/v1/kbs/1/files?page=1&page_size=20" -H "X-API-Key: your_key"</code></pre>
  </div>

  <!-- GET /open/v1/files/{file_id}/download -->
  <div class="endpoint">
    <div class="endpoint-title"><span class="badge get">GET</span>/api/open/v1/files/{file_id}/download</div>
    <p>下载指定文件的原始内容，响应为二进制流（<code>application/octet-stream</code>）。文件 ID 可从文件列表接口获取。</p>
    <h3>路径参数</h3>
    <div class="field"><span class="fname">file_id</span><span class="ftype">integer*</span><span class="fdesc">文件 ID</span></div>
    <h3>示例</h3>
<pre><code>curl -OJ "/api/open/v1/files/42/download" -H "X-API-Key: your_key"</code></pre>
  </div>

  <!-- POST /open/v1/kbs/{kb_id}/upload -->
  <div class="endpoint">
    <div class="endpoint-title"><span class="badge post">POST</span>/api/open/v1/kbs/{kb_id}/upload</div>
    <p>上传文件到指定知识库。文件将自动进入处理队列（文本提取 → 向量化入库），处理完成后可通过问答接口检索。</p>
    <h3>路径参数</h3>
    <div class="field"><span class="fname">kb_id</span><span class="ftype">integer*</span><span class="fdesc">目标知识库 ID</span></div>
    <h3>请求体（multipart/form-data）</h3>
    <div class="field"><span class="fname">file</span><span class="ftype">File*</span><span class="fdesc">要上传的文件，必填。支持格式：pdf、docx、doc、xlsx、xls、pptx、ppt、txt、md、html、sql</span></div>
    <div class="field"><span class="fname">folder_id</span><span class="ftype">integer</span><span class="fdesc">目标文件夹 ID，不填则放到根目录</span></div>
    <h3>响应体（HTTP 201）</h3>
    <div class="field"><span class="fname">id</span><span class="ftype">integer</span><span class="fdesc">新建文件的 ID</span></div>
    <div class="field"><span class="fname">name</span><span class="ftype">string</span><span class="fdesc">文件名</span></div>
    <div class="field"><span class="fname">process_status</span><span class="ftype">string</span><span class="fdesc">初始为 <code>pending</code>，后台异步处理</span></div>
    <div class="tip">上传成功后可轮询 <strong>文件列表</strong> 接口查看 <code>process_status</code>，变为 <code>completed</code> 时即可检索。</div>
    <h3>示例</h3>
<pre><code>curl -X POST "/api/open/v1/kbs/1/upload" \\
  -H "X-API-Key: your_key" \\
  -F "file=@/path/to/document.pdf"</code></pre>
  </div>

  <h2 id="errors">错误码</h2>
  <table>
    <tr><th>HTTP 状态码</th><th>含义</th><th>处理建议</th></tr>
    <tr><td>401</td><td>缺少或无效的 API Key</td><td>检查 X-API-Key 头部是否正确</td></tr>
    <tr><td>403</td><td>无权访问该知识库</td><td>联系管理员为 Key 添加该 KB 权限</td></tr>
    <tr><td>404</td><td>会话不存在</td><td>不传 conversation_id 或重新创建会话</td></tr>
    <tr><td>429</td><td>请求频率超限</td><td>等待 60 秒后重试，或联系管理员调整限流</td></tr>
    <tr><td>500</td><td>服务器内部错误</td><td>检查日志或联系运维</td></tr>
  </table>
  <p>所有错误响应格式：<code>{"detail": "错误信息"}</code></p>

  <h2 id="examples">示例代码</h2>
  <h3>Python</h3>
<pre><code>import requests

API_BASE = "http://your-server/api/open"
API_KEY  = "your_api_key"

resp = requests.post(
    f"{API_BASE}/v1/ask",
    headers={"X-API-Key": API_KEY},
    json={"question": "报销流程是什么？", "kb_id": 1},
    timeout=120,
)
data = resp.json()
print(data["answer"])

# 多轮对话
conv_id = data["conversation_id"]
resp2 = requests.post(
    f"{API_BASE}/v1/ask",
    headers={"X-API-Key": API_KEY},
    json={"question": "需要哪些审批材料？", "kb_id": 1, "conversation_id": conv_id},
    timeout=120,
)
print(resp2.json()["answer"])</code></pre>

  <h3>JavaScript / Node.js</h3>
<pre><code>const BASE = 'http://your-server/api/open';
const KEY  = 'your_api_key';

async function ask(question, kbId, conversationId) {
  const res = await fetch(`${BASE}/v1/ask`, {
    method: 'POST',
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, kb_id: kbId, conversation_id: conversationId }),
  });
  return res.json();
}

const { answer, conversation_id } = await ask('报销流程是什么？', 1);
console.log(answer);

// 继续追问
const { answer: a2 } = await ask('需要哪些审批材料？', 1, conversation_id);
console.log(a2);</code></pre>

  <h3>Java (OkHttp)</h3>
<pre><code>OkHttpClient client = new OkHttpClient.Builder()
    .callTimeout(120, TimeUnit.SECONDS).build();

String body = "{\\"question\\":\\"报销流程是什么？\\",\\"kb_id\\":1}";
Request request = new Request.Builder()
    .url("http://your-server/api/open/v1/ask")
    .addHeader("X-API-Key", "your_api_key")
    .post(RequestBody.create(body, MediaType.parse("application/json")))
    .build();

try (Response resp = client.newCall(request).execute()) {
    JSONObject json = new JSONObject(resp.body().string());
    System.out.println(json.getString("answer"));
}</code></pre>

  <p style="margin-top:40px;color:#86868b;font-size:12px;text-align:center">
    企业知识库开放平台 · 如有问题请联系系统管理员
  </p>
</div>
</body>
</html>"""
    return HTMLResponse(content=html)
