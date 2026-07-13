import json
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import file_summary as summary_crud
from app.crud.file import get_file
from app.models.user import User

router = APIRouter()

_SUMMARY_PROMPT = (
    "请把我上传的文件内容要点提取出来，并且整理输出为markdown格式。"
)


_MAX_DIRECT_SEND_SIZE = 100 * 1024 * 1024  # 100 MB


def _extract_file_text(fs_path: str) -> str:
    """从文件路径提取纯文本内容，支持多种格式。
    parse_document 成功但返回空内容时，也会继续尝试直接读取文件。
    """
    extracted = ""

    # 1. 结构化解析（PDF / docx / xlsx 等）
    try:
        from app.services.doc_processor.parser import parse_document
        elements = parse_document(fs_path)
        texts = [e["content"] for e in elements if e["content"].strip()]
        extracted = "\n\n".join(texts)
    except Exception:
        pass

    # 2. 解析返回空时，兜底直接读取原始文件内容
    if not extracted.strip():
        try:
            with open(fs_path, "r", encoding="utf-8", errors="ignore") as f:
                extracted = f.read()
        except Exception:
            pass

    return extracted


@router.post("/files/{file_id}/summary")
def generate_or_get_summary(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    生成或读取文件提纲总结，以 SSE 流式返回。
    - 若数据库中已有记录且文件存在，直接流式返回缓存内容；
    - 否则调用 DeepSeek 生成，完成后保存 markdown 文件并写入数据库。
    """
    file_record = get_file(db, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")

    # ── 命中缓存 ──────────────────────────────────────────────────────────────
    existing = summary_crud.get_by_file_id(db, file_id)
    if existing and os.path.exists(existing.summary_path):
        cached = Path(existing.summary_path).read_text(encoding="utf-8")

        def stream_cached():
            chunk = 80
            for i in range(0, len(cached), chunk):
                yield f"data: {json.dumps(cached[i:i+chunk], ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_cached(), media_type="text/event-stream")

    # ── 准备文件内容 ──────────────────────────────────────────────────────────
    if file_record.file_size >= _MAX_DIRECT_SEND_SIZE:
        raise HTTPException(status_code=422, detail="文件内容超过大模型上限，无法进行总结")

    if not os.path.exists(file_record.fs_path):
        raise HTTPException(status_code=404, detail="文件内容不存在")

    file_text = _extract_file_text(file_record.fs_path)
    if not file_text.strip():
        # 小于 100MB 但无法提取内容：向模型说明情况，由模型给出反馈
        file_text = "（文件内容无法自动提取，请根据文件名尝试分析或告知用户无法处理。）"

    # 超长内容截断，避免超出模型上下文
    if len(file_text) > 40000:
        file_text = file_text[:40000] + "\n\n...(内容过长已截断)"

    user_message = (
        f"文件名：{file_record.name}\n\n"
        f"文件内容：\n{file_text}\n\n"
        f"{_SUMMARY_PROMPT}"
    )

    # ── SSE 流式生成并保存 ────────────────────────────────────────────────────
    def event_stream():
        from openai import OpenAI
        client = OpenAI(
            base_url=settings.summary_api_base,
            api_key=settings.summary_api_key or "no-key",
        )

        collected: list[str] = []
        try:
            stream = client.chat.completions.create(
                model=settings.summary_model,
                messages=[{"role": "user", "content": user_message}],
                max_tokens=settings.summary_max_tokens,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    collected.append(delta.content)
                    yield f"data: {json.dumps(delta.content, ensure_ascii=False)}\n\n"
        except Exception as exc:
            err = f"\n\n[生成失败: {exc}]"
            yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return

        yield "data: [DONE]\n\n"

        # 保存到本地文件 + 写入数据库（使用独立 session）
        if collected:
            full_md = "".join(collected)
            summary_dir = os.path.join(settings.upload_dir, "summaries")
            os.makedirs(summary_dir, exist_ok=True)
            summary_path = os.path.join(summary_dir, f"summary_{file_id}.md")
            try:
                Path(summary_path).write_text(full_md, encoding="utf-8")
                from app.core.database import SessionLocal
                with SessionLocal() as save_db:
                    if not summary_crud.get_by_file_id(save_db, file_id):
                        summary_crud.create_summary(save_db, file_id, summary_path)
            except Exception:
                pass  # 保存失败不影响前端展示

    return StreamingResponse(event_stream(), media_type="text/event-stream")
