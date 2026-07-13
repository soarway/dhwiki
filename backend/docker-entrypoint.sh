#!/bin/bash
# ============================================================
# 后端容器入口脚本
# 仅在启动 uvicorn（API 服务器）时执行迁移和数据初始化；
# celery_worker / celery_beat 跳过此步骤，避免并发迁移冲突。
# ============================================================
set -e

is_web_server() {
    # 判断是否以 uvicorn 启动
    [[ "$*" == *"uvicorn"* ]]
}

if is_web_server "$@"; then
    echo "[entrypoint] ===== 数据库迁移 ====="
    alembic upgrade head
    echo "[entrypoint] 迁移完成"

    echo "[entrypoint] ===== 初始数据初始化 ====="
    python /app/deploy_seed.py
    echo "[entrypoint] 初始化完成"
fi

exec "$@"
