# backend/app/core/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent.parent.parent / "deploy" / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 数据库
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = "123456"
    mysql_database: str = "knowledge_base"

    # 安全
    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # Redis / Celery
    redis_url: str = "redis://127.0.0.1:6379/0"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "knowledge-base"
    minio_secure: bool = False

    # Milvus
    milvus_host: str = "localhost"
    milvus_port: int = 19530
    milvus_collection: str = "document_chunks"

    # MeiliSearch
    meili_url: str = "http://localhost:7700"
    meili_master_key: str = "masterkey"
    meili_index: str = "document_chunks"

    # 嵌入模型
    embedding_model: str = "BAAI/bge-m3"
    embedding_device: str = "cpu"
    embedding_batch_size: int = 32

    # OCR
    ocr_lang: str = "ch"
    ocr_use_gpu: bool = False

    # Vision model（图片/图表分析，doubao-seed-1.6 或其他多模态模型）
    vision_api_base: str = "https://ark.volces.com/api/v3"
    vision_api_key: str = ""
    vision_model: str = "doubao-seed-1.6"

    # 文件上传
    upload_dir: str = "/tmp/knowledge_base_uploads"

    # 文件加密（AES-256-GCM）
    # 留空则禁用加密；填入 Base64 编码的 32 字节主密钥则启用
    # 生成命令：python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
    file_encrypt_key: str = ""

    # 目录监控
    watch_scan_interval_seconds: int = 300

    # LLM
    llm_api_base: str = "http://localhost:11434/v1"
    llm_api_key: str = "ollama"
    llm_model: str = "qwen2.5:7b"
    llm_temperature: float = 0.1
    llm_max_tokens: int = 2048

    # 文档提纲总结专用 LLM（DeepSeek）
    summary_api_base: str = "https://api.deepseek.com/v1"
    summary_api_key: str = ""
    summary_model: str = "deepseek-chat"
    summary_max_tokens: int = 4096

    # Reranker
    reranker_model: str = "BAAI/bge-reranker-v2-m3"

    # RAG 参数
    rag_retrieve_top_k: int = 20
    rag_rerank_top_n: int = 6
    rag_history_turns: int = 3

    # 局域网视觉代理（浏览器自动化 + 网页版 DeepSeek）
    # VISION_AGENT_HOST 留空则禁用；填写局域网 IP 启用
    vision_agent_host: str = ""
    vision_agent_port: int = 8811

    # CORS — 逗号分隔的允许来源列表，"*" 代表全部允许
    # 示例: CORS_ORIGINS=https://erp.company.com,https://oa.company.com
    cors_origins: str = "*"

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
            f"?charset=utf8mb4"
        )

    @property
    def celery_broker_url(self) -> str:
        return self.redis_url

    @property
    def celery_result_backend(self) -> str:
        return self.redis_url


settings = Settings()
