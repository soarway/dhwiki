import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, users, departments, roles, files, watch_dirs, permissions, chat, approval
from app.api import crawl, analytics, api_keys
from app.api import knowledge_bases, folders, social, kb_permissions, captcha
from app.api import open_api
from app.api import summary, wiki
from app.api import internal
from app.api import aeo_plugins
from app.core.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时清除今日 license 缓存，确保每次重启后首次登录重新校验
    try:
        from datetime import date
        from app.core.deps import _redis
        today_key = f"license:check:{date.today().isoformat()}"
        _redis().delete(today_key)
        logger.info("已清除 license 日缓存：%s", today_key)
    except Exception as e:
        logger.debug("清除 license 缓存失败（不影响启动）: %s", e)

    # 启动时预热：提前加载 embedding 和 reranker 模型，避免首次问答等待
    import asyncio
    loop = asyncio.get_event_loop()
    try:
        logger.info("预热 Embedding 模型 (BGE-M3)...")
        await loop.run_in_executor(None, _warmup_embedding)
        logger.info("Embedding 模型预热完成")
    except Exception as e:
        logger.warning(f"Embedding 模型预热失败（不影响启动）: {e}")
    try:
        logger.info("预热 Reranker 模型 (BGE-Reranker-v2-m3)...")
        await loop.run_in_executor(None, _warmup_reranker)
        logger.info("Reranker 模型预热完成")
    except Exception as e:
        logger.warning(f"Reranker 模型预热失败（不影响启动）: {e}")
    yield


def _warmup_embedding():
    from app.services.doc_processor.embedder import embed_texts
    embed_texts(["warmup"])


def _warmup_reranker():
    from app.services.rag.reranker import rerank
    rerank("warmup", [{"chunk_id": "0", "content": "warmup"}], top_n=1)


app = FastAPI(title="企业知识库 API", version="1.0.0", redirect_slashes=False, lifespan=lifespan)

# CORS：从配置读取，支持 "*" 或逗号分隔的具体来源
_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,  # credentials 与 wildcard 不兼容
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["认证"])
app.include_router(users.router, prefix="/users", tags=["用户管理"])
app.include_router(departments.router, prefix="/departments", tags=["部门管理"])
app.include_router(roles.router, prefix="/roles", tags=["角色管理"])
app.include_router(files.router, prefix="/files", tags=["文件管理"])
app.include_router(watch_dirs.router, prefix="/watch-dirs", tags=["监控目录"])
app.include_router(permissions.router, prefix="/permissions", tags=["权限管理"])
app.include_router(chat.router, prefix="/chat", tags=["知识问答"])
app.include_router(approval.router, prefix="/approvals", tags=["审批管理"])
app.include_router(crawl.router, prefix="/crawl", tags=["URL爬取"])
app.include_router(analytics.router, prefix="/analytics", tags=["查询分析"])  # NEW
app.include_router(api_keys.router, prefix="/api-keys", tags=["API密钥"])
app.include_router(knowledge_bases.router, prefix="/knowledge-bases", tags=["知识库管理"])
app.include_router(folders.router, prefix="/kb-folders", tags=["知识库文件夹"])
app.include_router(social.router, prefix="/social", tags=["社交功能"])
app.include_router(kb_permissions.router, prefix="", tags=["知识库权限与系统设置"])
app.include_router(captcha.router, prefix="", tags=["验证码"])
app.include_router(open_api.router, prefix="/open", tags=["开放平台 API"])
app.include_router(summary.router, prefix="", tags=["文档提纲总结"])
app.include_router(wiki.router, prefix="", tags=["Wiki文章"])
app.include_router(internal.router, prefix="/internal", tags=["内部管理"], include_in_schema=False)
app.include_router(aeo_plugins.router, prefix="/aeo", tags=["AEO检测插件"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
