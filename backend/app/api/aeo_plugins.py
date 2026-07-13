# backend/app/api/aeo_plugins.py
"""
AEO 插件管理 API

路由前缀（在 main.py 中注册为 /aeo）：

  POST   /plugins/{section}/run       — 异步执行指定章节的检测插件，返回 task_id
  GET    /plugins/tasks/{task_id}     — 轮询任务状态与结果
  POST   /plugins/{section}/upload    — 上传（替换）指定章节的插件脚本
  POST   /plugins/run-all             — 一键执行全部章节插件，返回 [{section, task_id}]
"""
import os

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.celery_app import celery_app
from app.core.deps import get_current_user
from app.tasks.aeo_plugin import run_aeo_plugin, _PLUGIN_DIR

router = APIRouter()

# 所有合法的 AEO 章节 dir_tag（不含 aeo_home）
AEO_SECTIONS = [
    "aeo_basic",
    "aeo_trade",
    "aeo_audit",
    "aeo_finance",
    "aeo_location",
    "aeo_hr",
    "aeo_cargo",
    "aeo_vehicle",
    "aeo_partner",
    "aeo_training",
]


def _check_section(section: str) -> None:
    if section not in AEO_SECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"未知的 AEO 章节：{section}，合法值：{AEO_SECTIONS}",
        )


# ── 1. 触发单章节检测 ────────────────────────────────────────────────────────

@router.post("/plugins/{section}/run")
def run_plugin(
    section: str,
    current_user=Depends(get_current_user),
):
    """
    异步执行指定章节的 AEO 检测插件。
    返回 task_id，前端凭此轮询 /plugins/tasks/{task_id} 获取结果。
    """
    _check_section(section)
    task = run_aeo_plugin.delay(section)
    return {"task_id": task.id, "section": section}


# ── 2. 轮询任务状态 ──────────────────────────────────────────────────────────

@router.get("/plugins/tasks/{task_id}")
def get_task_status(
    task_id: str,
    current_user=Depends(get_current_user),
):
    """
    轮询 Celery 任务状态。

    返回格式：
      {"status": "pending"|"running"|"success"|"failure", "result": {...}}
    status 说明：
      pending  — 任务排队等待执行
      running  — 任务正在执行
      success  — 任务执行完毕，result 字段包含插件返回值
      failure  — 任务执行异常（插件内部未捕获的异常），detail 字段包含错误信息
    """
    ar = AsyncResult(task_id, app=celery_app)
    state = ar.state  # PENDING / STARTED / SUCCESS / FAILURE / REVOKED

    if state == "PENDING":
        return {"status": "pending"}
    elif state in ("STARTED", "RETRY"):
        return {"status": "running"}
    elif state == "SUCCESS":
        return {"status": "success", "result": ar.result}
    elif state == "FAILURE":
        return {"status": "failure", "detail": str(ar.info)}
    else:
        return {"status": state.lower()}


# ── 3. 上传（替换）插件脚本 ──────────────────────────────────────────────────

@router.post("/plugins/{section}/upload")
async def upload_plugin(
    section: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """
    上传新版本的检测插件脚本（.py 文件），替换对应章节的占位插件。

    上传的脚本需满足接口规范：
      - 支持命令行参数 --dir_tag <str>
      - 向标准输出打印 JSON：{"result": "pass"} 或 {"result": "fail", "detail": "..."}
      - 以退出码 0 退出
    """
    _check_section(section)

    if not file.filename.endswith(".py"):
        raise HTTPException(status_code=400, detail="只允许上传 .py 格式的 Python 插件脚本。")

    section_name = section.removeprefix("aeo_")
    os.makedirs(_PLUGIN_DIR, exist_ok=True)
    target_path = os.path.join(_PLUGIN_DIR, f"plugin_{section_name}.py")

    content = await file.read()
    with open(target_path, "wb") as f:
        f.write(content)

    return {
        "message": f"插件 plugin_{section_name}.py 上传成功，下次执行 AI检测 时将使用新脚本。",
        "section": section,
        "file": f"plugin_{section_name}.py",
    }


# ── 4. 一键执行全部章节 ──────────────────────────────────────────────────────

@router.post("/plugins/run-all")
def run_all_plugins(
    current_user=Depends(get_current_user),
):
    """
    一键触发所有 AEO 章节的检测插件（异步并行）。
    返回各章节的 task_id 列表，前端对每个 task_id 独立轮询结果。
    """
    results = []
    for section in AEO_SECTIONS:
        task = run_aeo_plugin.delay(section)
        results.append({"section": section, "task_id": task.id})
    return results
